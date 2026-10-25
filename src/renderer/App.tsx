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
  const [apps, setApps] = useState<
    { name: string; volume: number; muted: boolean }[]
  >([]);
  const sessionsRevision = useRef(0);

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
  const gaugeSize = Math.max(
    1,
    Math.min(
      264,
      Math.floor(
        (viewportWidth - 48 - Math.max(apps.length - 1, 0) * 8) /
          Math.max(apps.length, 1) -
          12,
      ),
      viewportHeight - 188,
    ),
  );

  return (
    <div
      id="app-volumes"
      style={{
        gridTemplateColumns: `repeat(${Math.max(apps.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {apps.map((app) => (
        <AppVolume
          key={app.name}
          app={app}
          gaugeSize={gaugeSize}
          onVolumeChange={handleVolumeChange}
          onMuteChange={handleMuteChange}
        />
      ))}
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

function AppVolume({
  app,
  gaugeSize,
  onVolumeChange,
  onMuteChange,
}: {
  app: { name: string; volume: number; muted: boolean };
  gaugeSize: number;
  onVolumeChange: (name: string, volume: number) => void;
  onMuteChange: (name: string, muted: boolean) => void;
}) {
  const isDragging = useRef(false);
  const percentage = Math.round(app.volume * 100);

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

    onVolumeChange(app.name, nextVolume);
    setAppVolume(app.name, nextVolume);
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
    <div className="app-volume">
      <div
        className={`app-gauge${app.muted ? ' is-muted' : ''}`}
        style={{ width: gaugeSize, height: gaugeSize }}
        role="slider"
        aria-label={`${app.name} volume`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${percentage}%${app.muted ? ', muted' : ''}`}
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
        onWheel={(event) =>
          adjustVolumeWithWheel(event, app.volume, 0.05, 0, 1, (nextVolume) => {
            onVolumeChange(app.name, nextVolume);
            setAppVolume(app.name, nextVolume);
          })
        }
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
