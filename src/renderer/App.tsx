import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import { Slider } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';

type AppSession = { name: string; volume: number; muted: boolean };

const hiddenAppNamesStorageKey = 'audio-panel:hidden-app-names';
const appOrderStorageKey = 'audio-panel:app-order';

export const gaugeCollisionDetection = (
  {
    active,
    collisionRect,
    droppableContainers,
    droppableRects,
    pointerCoordinates,
  }: Parameters<CollisionDetection>[0],
  fixedGaugeRects: ReadonlyMap<string, DOMRect> = new Map(),
) => {
  const gaugeContainers = droppableContainers.filter(
    (container) => container.id !== active.id,
  );
  const gaugeRects = new Map(droppableRects);

  fixedGaugeRects.forEach((rect, id) => gaugeRects.set(id, rect));

  const collisionArguments = {
    active,
    collisionRect,
    droppableContainers: gaugeContainers,
    droppableRects: gaugeRects,
    pointerCoordinates,
  };

  if (!pointerCoordinates) {
    return closestCenter(collisionArguments);
  }

  const startRect = active.rect.current.initial;
  if (!startRect) {
    return [];
  }

  const startCenter = startRect.left + startRect.width / 2;
  const currentCenter = collisionRect.left + collisionRect.width / 2;
  const movingRight = currentCenter > startCenter;
  const movingLeft = currentCenter < startCenter;
  const crossedTargets = gaugeContainers.flatMap((container) => {
    const rect = gaugeRects.get(container.id);
    if (!rect) {
      return [];
    }

    const center = rect.left + rect.width / 2;
    const crossingThreshold = rect.width * 0.35;
    const crossed =
      (movingRight &&
        center > startCenter &&
        center - crossingThreshold <= currentCenter) ||
      (movingLeft &&
        center < startCenter &&
        center + crossingThreshold >= currentCenter);
    return crossed ? [{ container, center }] : [];
  });

  const target = crossedTargets.reduce<
    (typeof crossedTargets)[number] | undefined
  >((nearest, candidate) => {
    if (!nearest) {
      return candidate;
    }
    return movingRight
      ? candidate.center > nearest.center
        ? candidate
        : nearest
      : candidate.center < nearest.center
        ? candidate
        : nearest;
  }, undefined);

  return target
    ? closestCenter({
        ...collisionArguments,
        droppableContainers: [target.container],
      })
    : [];
};

function loadHiddenAppNames(): string[] {
  try {
    const storedNames = window.localStorage.getItem(hiddenAppNamesStorageKey);
    if (storedNames === null) {
      return [];
    }

    const parsedNames: unknown = JSON.parse(storedNames);
    if (
      Array.isArray(parsedNames) &&
      parsedNames.every((name) => typeof name === 'string')
    ) {
      return parsedNames;
    }

    console.error('Stored hidden app names must be an array of strings.');
  } catch (error) {
    console.error('Failed to load hidden app names.', error);
  }

  return [];
}

function loadAppOrder(): string[] {
  try {
    const storedOrder = window.localStorage.getItem(appOrderStorageKey);
    if (storedOrder === null) {
      return [];
    }

    const parsedOrder: unknown = JSON.parse(storedOrder);
    if (
      Array.isArray(parsedOrder) &&
      parsedOrder.every((name) => typeof name === 'string')
    ) {
      return parsedOrder;
    }

    console.error('Stored app order must be an array of strings.');
  } catch (error) {
    console.error('Failed to load app order.', error);
  }

  return [];
}

function orderApps(apps: AppSession[], order: string[]): AppSession[] {
  const positions = new Map(order.map((name, index) => [name, index]));
  return [...apps].sort(
    (first, second) =>
      (positions.get(first.name) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(second.name) ?? Number.MAX_SAFE_INTEGER),
  );
}

function adjustVolumeWithWheel(
  event: WheelEvent,
  volume: number,
  step: number,
  min: number,
  max: number,
  onChange: (volume: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();

  if (event.deltaY === 0) {
    return;
  }

  const nextVolume = Math.min(
    max,
    Math.max(min, volume - Math.sign(event.deltaY) * step),
  );
  if (nextVolume !== volume) {
    onChange(nextVolume);
  }
}

function LoadMainVolume() {
  const [volume, setVolume] = useState(-60);
  const [mainMuted, setMainMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(-60);
  const [musicMuted, setMusicMuted] = useState(false);

  useEffect(() => {
    window.electron.audio
      .getMainVolume()
      .then(setVolume)
      .catch((error) => console.error(error));

    return window.electron.audio.onMainVolumeChanged(setVolume);
  }, []);

  useEffect(() => {
    window.electron.audio
      .getMainMute()
      .then(setMainMuted)
      .catch((error) => console.error(error));

    return window.electron.audio.onMainMuteChanged(setMainMuted);
  }, []);

  useEffect(() => {
    window.electron.audio
      .getMusicVolume()
      .then(setMusicVolume)
      .catch((error) => console.error(error));

    return window.electron.audio.onMusicVolumeChanged(setMusicVolume);
  }, []);

  useEffect(() => {
    window.electron.audio
      .getMusicMute()
      .then(setMusicMuted)
      .catch((error) => console.error(error));

    return window.electron.audio.onMusicMuteChanged(setMusicMuted);
  }, []);

  const setMusicVolumeValue = (nextVolume: number) => {
    setMusicVolume(nextVolume);
    window.electron.audio
      .setMusicVolume(nextVolume)
      .catch((error) => console.error(error));
  };

  return (
    <main className="audio-panel">
      <section className="master-control">
        <Slider
          className={`master-slider${mainMuted ? ' is-muted' : ''}`}
          aria-label="Master volume"
          aria-valuetext={`${volume} dB${mainMuted ? ', muted' : ''}`}
          value={volume}
          step={1}
          min={-60}
          max={12}
          onChange={(_event, value) => {
            setVolume(value);
            setMainVolume(value);
          }}
          onWheel={(event) =>
            adjustVolumeWithWheel(event, volume, 4, -60, 12, (nextVolume) => {
              setVolume(nextVolume);
              setMainVolume(nextVolume);
            })
          }
          onContextMenu={(event) => {
            event.preventDefault();
            const nextMuted = !mainMuted;
            setMainMuted(nextMuted);
            window.electron.audio
              .setMainMute(nextMuted)
              .catch((error) => console.error(error));
          }}
        />
      </section>

      <section
        className="apps-section"
        aria-label="Application volume controls"
      >
        <LoadAppVolumes />
      </section>

      <section className="music-control">
        <Slider
          className={`music-slider${musicMuted ? ' is-muted' : ''}`}
          aria-label="Music volume"
          aria-valuetext={`${musicVolume} dB${musicMuted ? ', muted' : ''}`}
          value={musicVolume}
          step={1}
          min={-60}
          max={12}
          onChange={(_event, value) => {
            setMusicVolumeValue(value);
          }}
          onWheel={(event) =>
            adjustVolumeWithWheel(
              event,
              musicVolume,
              4,
              -60,
              12,
              setMusicVolumeValue,
            )
          }
          onContextMenu={(event) => {
            event.preventDefault();
            const nextMuted = !musicMuted;
            setMusicMuted(nextMuted);
            window.electron.audio
              .setMusicMute(nextMuted)
              .catch((error) => console.error(error));
          }}
        />
      </section>
    </main>
  );
}

function setMainVolume(volume: number) {
  window.electron.audio
    .setMainVolume(volume)
    .catch((error) => console.error(error));
}

function LoadAppVolumes() {
  const [apps, setApps] = useState<AppSession[]>([]);
  const [hiddenAppNames, setHiddenAppNames] = useState(
    () => new Set(loadHiddenAppNames()),
  );
  const [appOrder, setAppOrder] = useState(loadAppOrder);
  const [draggedApp, setDraggedApp] = useState<{
    app: AppSession;
    width: number;
    height: number;
  } | null>(null);
  const sessionsRevision = useRef(0);
  const activeSessionNames = useRef(new Set<string>());
  const hasInitialSessionSnapshot = useRef(false);
  const gaugeDropRects = useRef(new Map<string, DOMRect>());

  useEffect(() => {
    try {
      window.localStorage.setItem(
        hiddenAppNamesStorageKey,
        JSON.stringify([...hiddenAppNames]),
      );
    } catch (error) {
      console.error('Failed to save hidden app names.', error);
    }
  }, [hiddenAppNames]);

  useEffect(() => {
    try {
      window.localStorage.setItem(appOrderStorageKey, JSON.stringify(appOrder));
    } catch (error) {
      console.error('Failed to save app order.', error);
    }
  }, [appOrder]);

  const handleVisibilityChange = useCallback(
    (name: string, isHidden: boolean) => {
      setHiddenAppNames((currentNames) => {
        if (currentNames.has(name) === isHidden) {
          return currentNames;
        }

        const nextNames = new Set(currentNames);
        if (isHidden) {
          nextNames.add(name);
        } else {
          nextNames.delete(name);
        }
        return nextNames;
      });
    },
    [],
  );

  const handleVolumeChange = useCallback((name: string, volume: number) => {
    setApps((currentApps) =>
      currentApps.map((app) => (app.name === name ? { ...app, volume } : app)),
    );
  }, []);

  const handleMuteChange = useCallback((name: string, muted: boolean) => {
    setApps((currentApps) =>
      currentApps.map((app) => (app.name === name ? { ...app, muted } : app)),
    );
  }, []);

  useEffect(() => {
    let isActive = true;
    const initialRevision = sessionsRevision.current;
    const unsubscribeFromSessionChanges =
      window.electron.audio.onAppSessionsChanged((currentApps) => {
        sessionsRevision.current += 1;
        const newSessionNames = currentApps
          .map((app) => app.name)
          .filter((name) => !activeSessionNames.current.has(name));
        activeSessionNames.current = new Set(
          currentApps.map((app) => app.name),
        );

        if (!hasInitialSessionSnapshot.current) {
          hasInitialSessionSnapshot.current = true;
          setAppOrder((currentOrder) => [
            ...currentOrder,
            ...currentApps
              .map((app) => app.name)
              .filter((name) => !currentOrder.includes(name)),
          ]);
        } else if (newSessionNames.length > 0) {
          const newlyOpenedNames = new Set(newSessionNames);
          setAppOrder((currentOrder) => [
            ...currentOrder.filter((name) => !newlyOpenedNames.has(name)),
            ...newSessionNames,
          ]);
        }

        setApps((previousApps) => {
          const sessionsByName = new Map(
            currentApps.map((app) => [app.name, app]),
          );
          const existingApps = previousApps.flatMap((app) => {
            const updatedApp = sessionsByName.get(app.name);
            return updatedApp ? [updatedApp] : [];
          });
          const existingNames = new Set(existingApps.map((app) => app.name));
          const newApps = currentApps.filter(
            (app) => !existingNames.has(app.name),
          );

          return [...existingApps, ...newApps];
        });
      });

    const unsubscribeFromVolumeChanges =
      window.electron.audio.onAppVolumeChanged(handleVolumeChange);
    const unsubscribeFromMuteChanges =
      window.electron.audio.onAppMuteChanged(handleMuteChange);

    window.electron.audio
      .getAppVolumes()
      .then((initialApps) => {
        if (isActive && sessionsRevision.current === initialRevision) {
          hasInitialSessionSnapshot.current = true;
          activeSessionNames.current = new Set(
            initialApps.map((app) => app.name),
          );
          setAppOrder((currentOrder) => [
            ...currentOrder,
            ...initialApps
              .map((app) => app.name)
              .filter((name) => !currentOrder.includes(name)),
          ]);
          setApps(initialApps);
        }
        return initialApps;
      })
      .catch(console.error);

    return () => {
      isActive = false;
      unsubscribeFromSessionChanges();
      unsubscribeFromVolumeChanges();
      unsubscribeFromMuteChanges();
    };
  }, [handleMuteChange, handleVolumeChange]);

  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;
  const orderedApps = orderApps(apps, appOrder);
  const visibleApps = orderedApps.filter(
    (app) => !hiddenAppNames.has(app.name),
  );
  const hiddenApps = orderedApps.filter((app) => hiddenAppNames.has(app.name));

  const handleGaugeDragStart = ({ active }: DragStartEvent) => {
    const rects = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>('.visible-apps .app-gauge[data-app-name]')
      .forEach((gauge) => {
        const name = gauge.dataset.appName;
        if (name) {
          rects.set(name, gauge.getBoundingClientRect());
        }
      });
    gaugeDropRects.current = rects;

    const app = visibleApps.find((candidate) => candidate.name === active.id);
    const gauge = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.visible-apps .app-gauge[data-app-name]',
      ),
    ).find((element) => element.dataset.appName === active.id);
    const tile = gauge?.closest<HTMLElement>('.app-volume');
    const tileRect = tile?.getBoundingClientRect();
    if (app && tileRect) {
      setDraggedApp({
        app,
        width: tileRect.width,
        height: tileRect.height,
      });
    }
  };
  const handleGaugeDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedApp(null);
    if (!over || active.id === over.id) {
      gaugeDropRects.current.clear();
      return;
    }

    const visibleNames = visibleApps.map((app) => app.name);
    const oldIndex = visibleNames.indexOf(String(active.id));
    const newIndex = visibleNames.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      gaugeDropRects.current.clear();
      return;
    }

    const reorderedNames = arrayMove(visibleNames, oldIndex, newIndex);
    const reorderedNameSet = new Set(reorderedNames);
    let nextVisibleIndex = 0;
    setAppOrder((currentOrder) => {
      const completeOrder = [
        ...currentOrder,
        ...orderedApps
          .map((app) => app.name)
          .filter((name) => !currentOrder.includes(name)),
      ];
      return completeOrder.map((name) =>
        reorderedNameSet.has(name) ? reorderedNames[nextVisibleIndex++] : name,
      );
    });
    gaugeDropRects.current.clear();
  };
  const handleGaugeDragCancel = () => {
    setDraggedApp(null);
    gaugeDropRects.current.clear();
  };
  const detectGaugeCollisions = useCallback<CollisionDetection>(
    (args) => gaugeCollisionDetection(args, gaugeDropRects.current),
    [],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 1 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const hiddenAppColumnWidth = 56;
  const hiddenAppGap = 32;
  const hiddenAppsWidth =
    hiddenApps.length * hiddenAppColumnWidth +
    Math.max(hiddenApps.length - 1, 0) * hiddenAppGap;
  const gaugeSize = Math.max(
    1,
    Math.min(
      264,
      Math.floor(
        (viewportWidth -
          48 -
          (hiddenApps.length > 0 ? hiddenAppsWidth + 8 : 0) -
          Math.max(visibleApps.length - 1, 0) * 8) /
          Math.max(visibleApps.length, 1) -
          12,
      ),
      viewportHeight - 188,
    ),
  );

  return (
    <div
      id="app-volumes"
      style={{
        gridTemplateColumns:
          hiddenApps.length > 0
            ? `${hiddenAppsWidth}px minmax(0, 1fr)`
            : 'minmax(0, 1fr)',
      }}
    >
      {hiddenApps.length > 0 && (
        <div
          className="hidden-apps"
          aria-label="Hidden application sessions"
          style={{
            gridTemplateColumns: `repeat(${hiddenApps.length}, ${hiddenAppColumnWidth}px)`,
            columnGap: hiddenAppGap,
          }}
        >
          {hiddenApps.map((app) => (
            <HiddenAppVolume
              key={app.name}
              app={app}
              gaugeSize={gaugeSize}
              onVolumeChange={handleVolumeChange}
              onMuteChange={handleMuteChange}
              onVisibilityChange={handleVisibilityChange}
            />
          ))}
        </div>
      )}
      {apps.length > 0 && (
        <DndContext
          sensors={sensors}
          modifiers={[restrictToHorizontalAxis]}
          collisionDetection={detectGaugeCollisions}
          onDragStart={handleGaugeDragStart}
          onDragEnd={handleGaugeDragEnd}
          onDragCancel={handleGaugeDragCancel}
        >
          <SortableContext
            items={visibleApps.map((app) => app.name)}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className="visible-apps"
              style={{
                gridTemplateColumns: `repeat(${Math.max(visibleApps.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              {visibleApps.map((app) => (
                <AppVolume
                  key={app.name}
                  app={app}
                  gaugeSize={gaugeSize}
                  onVolumeChange={handleVolumeChange}
                  onMuteChange={handleMuteChange}
                  onVisibilityChange={handleVisibilityChange}
                />
              ))}
              {visibleApps.length === 0 && (
                <p className="empty-state">No visible apps</p>
              )}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggedApp && (
              <AppVolumeDragOverlay
                app={draggedApp.app}
                gaugeSize={gaugeSize}
                width={draggedApp.width}
                height={draggedApp.height}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}
      {apps.length === 0 && <p className="empty-state">No active apps</p>}
    </div>
  );
}

function setAppVolume(name: string, volume: number) {
  window.electron.audio
    .setAppVolume(name, volume)
    .catch((error) => console.error(error));
}

function setAppMuted(name: string, muted: boolean) {
  window.electron.audio
    .setAppMute(name, muted)
    .catch((error) => console.error(error));
}

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!visible && <path d="m3 3 18 18" />}
    </svg>
  );
}

function HiddenAppVolume({
  app,
  gaugeSize,
  onVolumeChange,
  onMuteChange,
  onVisibilityChange,
}: {
  app: AppSession;
  gaugeSize: number;
  onVolumeChange: (name: string, volume: number) => void;
  onMuteChange: (name: string, muted: boolean) => void;
  onVisibilityChange: (name: string, isHidden: boolean) => void;
}) {
  const percentage = Math.round(app.volume * 100);

  const updateVolume = (nextVolume: number) => {
    onVolumeChange(app.name, nextVolume);
    setAppVolume(app.name, nextVolume);
  };

  return (
    <div
      className={`hidden-app-volume${app.muted ? ' is-muted' : ''}`}
      style={{ height: gaugeSize + 32 }}
      onContextMenu={(event) => {
        event.preventDefault();
        const nextMuted = !app.muted;
        onMuteChange(app.name, nextMuted);
        setAppMuted(app.name, nextMuted);
      }}
    >
      <div
        className="hidden-app-slider-track"
        style={{ height: gaugeSize, marginBottom: -22 }}
      >
        <Slider
          className="hidden-app-slider"
          aria-label={`${app.name} volume (hidden)`}
          aria-valuetext={`${percentage}%${app.muted ? ', muted' : ''}`}
          value={app.volume}
          step={0.01}
          min={0}
          max={1}
          orientation="vertical"
          style={{
            width: 24,
            height: gaugeSize * 0.69,
            top: gaugeSize * 0.15,
          }}
          onChange={(_event, value) => {
            if (typeof value === 'number') {
              updateVolume(value);
            }
          }}
          onWheel={(event) =>
            adjustVolumeWithWheel(event, app.volume, 0.05, 0, 1, updateVolume)
          }
        />
      </div>
      <button
        className="hidden-app-visibility-toggle"
        type="button"
        aria-label={`Show ${app.name} gauge`}
        title={`Show ${app.name} gauge`}
        style={{ height: 44 }}
        onClick={() => onVisibilityChange(app.name, false)}
      >
        <VisibilityIcon visible />
        <h3 className="app-name hidden-app-name">{app.name}</h3>
      </button>
    </div>
  );
}

function AppVolumeDragOverlay({
  app,
  gaugeSize,
  width,
  height,
}: {
  app: AppSession;
  gaugeSize: number;
  width: number;
  height: number;
}) {
  const percentage = Math.round(app.volume * 100);

  return (
    <div
      className="app-volume app-volume-drag-overlay"
      style={{ width, height }}
      aria-hidden="true"
    >
      <div
        className="app-gauge-container"
        style={{ width: gaugeSize, height: gaugeSize }}
      >
        <div className={`app-gauge${app.muted ? ' is-muted' : ''}`}>
          <Gauge
            skipAnimation
            value={percentage}
            valueMin={0}
            valueMax={100}
            startAngle={-135}
            endAngle={135}
            width={gaugeSize}
            height={gaugeSize}
            innerRadius="67%"
            outerRadius="90%"
            cornerRadius="50%"
            text={({ value }) => (app.muted ? '' : `${Math.round(value ?? 0)}`)}
          />
          {app.muted && (
            <svg className="app-muted-icon" viewBox="0 0 48 48">
              <path d="M7 18v12h9l12 9V9l-12 9H7z" fill="currentColor" />
              <path
                d="m34 18 10 12m0-12L34 30"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
          )}
        </div>
      </div>
      <h3 className="app-name" title={app.name}>
        {app.name}
      </h3>
    </div>
  );
}

function AppVolume({
  app,
  gaugeSize,
  onVolumeChange,
  onMuteChange,
  onVisibilityChange,
}: {
  app: AppSession;
  gaugeSize: number;
  onVolumeChange: (name: string, volume: number) => void;
  onMuteChange: (name: string, muted: boolean) => void;
  onVisibilityChange: (name: string, isHidden: boolean) => void;
}) {
  const isDragging = useRef(false);
  const {
    attributes,
    isDragging: isSorting,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: app.name });
  const percentage = Math.round(app.volume * 100);

  const updateVolume = (nextVolume: number) => {
    onVolumeChange(app.name, nextVolume);
    setAppVolume(app.name, nextVolume);
  };

  const handleVolumeWheel = (event: WheelEvent) =>
    adjustVolumeWithWheel(event, app.volume, 0.05, 0, 1, updateVolume);

  const setVolumeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return;
    }

    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const angle =
      (Math.atan2(event.clientX - centerX, centerY - event.clientY) * 180) /
      Math.PI;
    const clampedAngle = Math.min(135, Math.max(-135, angle));
    const nextVolume = (clampedAngle + 135) / 270;

    updateVolume(nextVolume);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowUp: 0.01,
      ArrowRight: 0.01,
      ArrowDown: -0.01,
      ArrowLeft: -0.01,
      PageUp: 0.1,
      PageDown: -0.1,
    };

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextVolume = event.key === 'Home' ? 0 : 1;
      onVolumeChange(app.name, nextVolume);
      setAppVolume(app.name, nextVolume);
      return;
    }

    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      const nextVolume = Math.min(1, Math.max(0, app.volume + step));
      onVolumeChange(app.name, nextVolume);
      setAppVolume(app.name, nextVolume);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`app-volume${isSorting ? ' is-ordering' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSorting ? 0 : 1,
      }}
    >
      <div
        className="app-gauge-container"
        style={{ width: gaugeSize, height: gaugeSize }}
      >
        <div
          className={`app-gauge${app.muted ? ' is-muted' : ''}`}
          role="slider"
          aria-label={`${app.name} volume`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-valuetext={`${percentage}%${app.muted ? ', muted' : ''}`}
          data-app-name={app.name}
          tabIndex={0}
          onContextMenu={(event) => {
            event.preventDefault();
            const nextMuted = !app.muted;
            onMuteChange(app.name, nextMuted);
            setAppMuted(app.name, nextMuted);
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            const bounds = event.currentTarget.getBoundingClientRect();
            const centerX = bounds.left + bounds.width / 2;
            const centerY = bounds.top + bounds.height * 0.5677;
            const gaugeRadius = Math.min(bounds.width, bounds.height) * 0.586;
            const pointerX = event.clientX - centerX;
            const pointerY = centerY - event.clientY;
            const distance = Math.hypot(pointerX, pointerY);
            const angle = Math.atan2(pointerX, pointerY) * (180 / Math.PI);
            const innerRadius = gaugeRadius * 0.9 * 0.67;
            const outerRadius = gaugeRadius * 0.9;
            if (
              distance < innerRadius ||
              distance > outerRadius ||
              Math.abs(angle) > 135
            ) {
              return;
            }

            event.currentTarget.setPointerCapture(event.pointerId);
            isDragging.current = true;
            setVolumeFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (isDragging.current) {
              setVolumeFromPointer(event);
            }
          }}
          onPointerUp={() => {
            isDragging.current = false;
          }}
          onPointerCancel={() => {
            isDragging.current = false;
          }}
          onLostPointerCapture={() => {
            isDragging.current = false;
          }}
          onWheel={handleVolumeWheel}
        >
          <Gauge
            aria-hidden="true"
            skipAnimation
            value={percentage}
            valueMin={0}
            valueMax={100}
            startAngle={-135}
            endAngle={135}
            width={gaugeSize}
            height={gaugeSize}
            innerRadius="67%"
            outerRadius="90%"
            cornerRadius="50%"
            text={({ value }) => (app.muted ? '' : `${Math.round(value ?? 0)}`)}
          />
          {app.muted && (
            <svg
              className="app-muted-icon"
              aria-hidden="true"
              viewBox="0 0 48 48"
            >
              <path d="M7 18v12h9l12 9V9l-12 9H7z" fill="currentColor" />
              <path
                d="m34 18 10 12m0-12L34 30"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
          )}
        </div>
        <button
          ref={setActivatorNodeRef}
          className="app-gauge-drag-handle"
          type="button"
          aria-label={`Reorder ${app.name} gauge`}
          title={`Drag to reorder ${app.name}`}
          onWheel={handleVolumeWheel}
          {...attributes}
          {...listeners}
        />
        <button
          className="app-visibility-toggle"
          type="button"
          aria-label={`Hide ${app.name} gauge`}
          title={`Hide ${app.name} gauge`}
          onClick={() => onVisibilityChange(app.name, true)}
        >
          <VisibilityIcon visible={false} />
        </button>
      </div>
      <h3 className="app-name" title={app.name}>
        {app.name}
      </h3>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoadMainVolume />} />
      </Routes>
    </Router>
  );
}
