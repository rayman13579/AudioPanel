import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import App, { gaugeCollisionDetection } from '../renderer/App';
import type { CollisionDetection } from '@dnd-kit/core';

const setAppVolume = jest.fn();
const setAppMute = jest.fn();
const setMusicMuteMock = jest.fn();
const setMainMuteMock = jest.fn();
let sessionChangeListener:
  | ((apps: { name: string; volume: number; muted: boolean }[]) => void)
  | undefined;

describe('gaugeCollisionDetection', () => {
  it('swaps within a small threshold around the target gauge center', () => {
    const activeRect = {
      top: 0,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
    };
    const targetRect = { ...activeRect, left: 100, right: 200 };
    const args = {
      active: {
        id: 'Music Player',
        rect: { current: { initial: activeRect, translated: activeRect } },
      },
      collisionRect: { ...activeRect, left: 59, right: 159 },
      droppableContainers: [{ id: 'Game' }],
      droppableRects: new Map([['Game', targetRect]]),
      pointerCoordinates: { x: 149, y: 200 },
    } as Parameters<CollisionDetection>[0];

    expect(gaugeCollisionDetection(args, new Map())).toHaveLength(0);

    const collision = gaugeCollisionDetection(
      {
        ...args,
        collisionRect: { ...activeRect, left: 65, right: 165 },
        pointerCoordinates: { x: 150, y: 200 },
      },
      new Map([['Game', targetRect as DOMRect]]),
    );
    expect(collision.map(({ id }) => id)).toEqual(['Game']);
  });
});
let appMuteChangeListener: ((name: string, muted: boolean) => void) | undefined;
let musicMuteChangeListener: ((muted: boolean) => void) | undefined;
let mainMuteChangeListener: ((muted: boolean) => void) | undefined;
const setMusicVolumeMock = jest.fn();

beforeEach(() => {
  window.localStorage.clear();
  sessionChangeListener = undefined;
  appMuteChangeListener = undefined;
  musicMuteChangeListener = undefined;
  mainMuteChangeListener = undefined;
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: (value: unknown) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
  });
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: MouseEvent,
  });
  setAppVolume.mockClear();
  setAppVolume.mockResolvedValue(undefined);
  setAppMute.mockClear();
  setAppMute.mockResolvedValue(undefined);
  setMainMuteMock.mockClear();
  setMainMuteMock.mockResolvedValue(undefined);
  setMusicMuteMock.mockClear();
  setMusicMuteMock.mockResolvedValue(undefined);
  setMusicVolumeMock.mockClear();
  setMusicVolumeMock.mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: jest.fn(),
  });
  window.electron = {
    audio: {
      getMainVolume: jest.fn().mockResolvedValue(-6),
      setMainVolume: jest.fn().mockResolvedValue(undefined),
      onMainVolumeChanged: jest.fn().mockReturnValue(jest.fn()),
      getMainMute: jest.fn().mockResolvedValue(false),
      setMainMute: setMainMuteMock,
      onMainMuteChanged: jest.fn((callback) => {
        mainMuteChangeListener = callback;
        return jest.fn();
      }),
      getMusicVolume: jest.fn().mockResolvedValue(-12),
      setMusicVolume: setMusicVolumeMock,
      onMusicVolumeChanged: jest.fn().mockReturnValue(jest.fn()),
      getMusicMute: jest.fn().mockResolvedValue(false),
      setMusicMute: setMusicMuteMock,
      onMusicMuteChanged: jest.fn((callback) => {
        musicMuteChangeListener = callback;
        return jest.fn();
      }),
      getAppVolumes: jest
        .fn()
        .mockResolvedValue([
          { name: 'Music Player', volume: 0.5, muted: false },
        ]),
      onAppSessionsChanged: jest.fn((callback) => {
        sessionChangeListener = callback;
        return jest.fn();
      }),
      setAppVolume,
      onAppVolumeChanged: jest.fn().mockReturnValue(jest.fn()),
      setAppMute,
      onAppMuteChanged: jest.fn((callback) => {
        appMuteChangeListener = callback;
        return jest.fn();
      }),
    },
  };
});

describe('Audio Panel', () => {
  it('renders the unlabeled master slider and app volume gauge', async () => {
    const { container } = render(<App />);

    expect(screen.queryByText('Main volume')).not.toBeInTheDocument();
    expect(screen.queryByText('App volumes')).not.toBeInTheDocument();
    expect(screen.queryByText('dB')).not.toBeInTheDocument();
    expect(container.querySelector('.master-value')).not.toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'Master volume' }),
    ).toBeInTheDocument();
    const gauge = await screen.findByRole('slider', {
      name: 'Music Player volume',
    });

    expect(gauge).toHaveAttribute('aria-valuenow', '50');
    const appName = screen.getByRole('heading', { name: 'Music Player' });
    expect(
      gauge.compareDocumentPosition(appName) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('.MuiGauge-valueText')).toHaveTextContent(
      '50',
    );
    const gaugeSize = Number(
      container
        .querySelector('.app-gauge svg')
        ?.getAttribute('viewBox')
        ?.split(' ')[2],
    );
    expect(gaugeSize).toBeGreaterThan(176);
  });

  it('toggles master mute on right-click and reflects mute state by color', async () => {
    render(<App />);
    const masterSlider = screen.getByRole('slider', {
      name: 'Master volume',
    });

    await waitFor(() => {
      expect(masterSlider).toHaveAttribute('aria-valuenow', '-6');
      expect(masterSlider).toHaveAttribute('aria-valuetext', '-6 dB');
    });
    expect(masterSlider.closest('.master-slider')).not.toHaveClass('is-muted');

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(masterSlider, contextMenuEvent);

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(setMainMuteMock).toHaveBeenLastCalledWith(true);
    expect(masterSlider.closest('.master-slider')).toHaveClass('is-muted');
    expect(masterSlider).toHaveAttribute('aria-valuetext', '-6 dB, muted');

    fireEvent.contextMenu(masterSlider);
    expect(setMainMuteMock).toHaveBeenLastCalledWith(false);
    expect(masterSlider.closest('.master-slider')).not.toHaveClass('is-muted');

    act(() => {
      mainMuteChangeListener?.(true);
    });
    expect(masterSlider.closest('.master-slider')).toHaveClass('is-muted');
  });

  it('supports dragging, wheel, and keyboard input on an app gauge', async () => {
    render(<App />);
    const gauge = await screen.findByRole('slider', {
      name: 'Music Player volume',
    });

    jest.spyOn(gauge, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 184,
      bottom: 184,
      width: 184,
      height: 184,
      toJSON: jest.fn(),
    });
    fireEvent.pointerDown(gauge, {
      pointerId: 2,
      button: 0,
      clientX: 92,
      clientY: 104,
    });
    expect(setAppVolume).not.toHaveBeenCalled();

    fireEvent.pointerDown(gauge, {
      pointerId: 3,
      button: 0,
      clientX: -4,
      clientY: 92,
    });
    expect(setAppVolume).not.toHaveBeenCalled();

    fireEvent.pointerDown(gauge, { pointerId: 1, clientX: 27, clientY: 157 });
    expect(setAppVolume).toHaveBeenLastCalledWith('Music Player', 0);

    fireEvent.pointerMove(gauge, { pointerId: 1, clientX: 92, clientY: 10 });
    expect(setAppVolume).toHaveBeenLastCalledWith('Music Player', 0.5);
    fireEvent.pointerUp(gauge, { pointerId: 1 });
    fireEvent.keyDown(gauge, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(setAppVolume).toHaveBeenLastCalledWith('Music Player', 0.51);
    });

    fireEvent.wheel(gauge, { deltaY: -1 });
    await waitFor(() => {
      expect(setAppVolume.mock.calls.at(-1)?.[0]).toBe('Music Player');
      expect(setAppVolume.mock.calls.at(-1)?.[1]).toBeCloseTo(0.56);
    });

    fireEvent.wheel(
      screen.getByRole('button', { name: 'Reorder Music Player gauge' }),
      { deltaY: -1 },
    );
    await waitFor(() => {
      expect(setAppVolume.mock.calls.at(-1)?.[0]).toBe('Music Player');
      expect(setAppVolume.mock.calls.at(-1)?.[1]).toBeCloseTo(0.61);
    });
  });

  it('toggles app mute on right-click and reflects mute state by color', async () => {
    render(<App />);
    const gauge = await screen.findByRole('slider', {
      name: 'Music Player volume',
    });
    jest.spyOn(gauge, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 184,
      bottom: 184,
      width: 184,
      height: 184,
      toJSON: jest.fn(),
    });

    expect(gauge).toHaveAttribute('aria-valuetext', '50%');
    expect(gauge).not.toHaveClass('is-muted');

    fireEvent.pointerDown(gauge, {
      pointerId: 1,
      button: 2,
      clientX: 92,
      clientY: 0,
    });
    expect(setAppVolume).not.toHaveBeenCalled();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(gauge, contextMenuEvent);

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(setAppMute).toHaveBeenLastCalledWith('Music Player', true);
    expect(gauge).toHaveClass('is-muted');
    expect(gauge).toHaveAttribute('aria-valuetext', '50%, muted');
    expect(gauge.querySelector('.app-muted-icon')).toBeInTheDocument();
    expect(gauge.querySelector('.MuiGauge-valueText')?.textContent).toBe('');

    fireEvent.contextMenu(gauge);
    expect(setAppMute).toHaveBeenLastCalledWith('Music Player', false);
    expect(gauge).not.toHaveClass('is-muted');
    expect(gauge.querySelector('.app-muted-icon')).not.toBeInTheDocument();
    expect(gauge.querySelector('.MuiGauge-valueText')).toHaveTextContent('50');

    act(() => {
      appMuteChangeListener?.('Music Player', true);
    });
    expect(gauge).toHaveClass('is-muted');
  });

  it('places newly added sessions on the right without reordering existing ones', async () => {
    const { container } = render(<App />);
    await screen.findByRole('slider', { name: 'Music Player volume' });

    act(() => {
      sessionChangeListener?.([
        { name: 'New App', volume: 0.25, muted: false },
        { name: 'Music Player', volume: 0.5, muted: false },
      ]);
    });

    await screen.findByRole('slider', { name: 'New App volume' });
    const appNames = Array.from(container.querySelectorAll('.app-name')).map(
      (heading) => heading.textContent,
    );
    expect(appNames).toEqual(['Music Player', 'New App']);
  });

  it('moves a reopened app to the far right of the gauge order', async () => {
    const activeApps = [
      { name: 'Music Player', volume: 0.5, muted: false },
      { name: 'Game', volume: 0.3, muted: false },
    ];
    window.electron.audio.getAppVolumes = jest
      .fn()
      .mockResolvedValue(activeApps);
    window.localStorage.setItem(
      'audio-panel:app-order',
      '["Music Player","Browser","Game"]',
    );

    const { container } = render(<App />);
    await screen.findByRole('slider', { name: 'Game volume' });

    act(() => {
      sessionChangeListener?.([
        { name: 'Browser', volume: 0.7, muted: false },
        ...activeApps,
      ]);
    });

    await screen.findByRole('slider', { name: 'Browser volume' });
    const appNames = Array.from(
      container.querySelectorAll('.visible-apps .app-name'),
    ).map((heading) => heading.textContent);
    expect(appNames).toEqual(['Music Player', 'Game', 'Browser']);
    expect(window.localStorage.getItem('audio-panel:app-order')).toBe(
      '["Music Player","Game","Browser"]',
    );
  });

  it('controls music volume and indicates mute state by color', async () => {
    render(<App />);
    const musicSlider = await screen.findByRole('slider', {
      name: 'Music volume',
    });

    await waitFor(() => {
      expect(musicSlider).toHaveAttribute('aria-valuenow', '-12');
      expect(musicSlider).toHaveAttribute('aria-valuetext', '-12 dB');
    });
    expect(musicSlider.closest('.music-slider')).not.toHaveClass('is-muted');
    fireEvent.keyDown(musicSlider, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(setMusicVolumeMock).toHaveBeenLastCalledWith(-11);
      expect(musicSlider).toHaveAttribute('aria-valuenow', '-11');
    });

    fireEvent.wheel(musicSlider, { deltaY: -1 });
    await waitFor(() => {
      expect(setMusicVolumeMock).toHaveBeenLastCalledWith(-7);
      expect(musicSlider).toHaveAttribute('aria-valuenow', '-7');
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(musicSlider, contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(setMusicMuteMock).toHaveBeenLastCalledWith(true);
    expect(musicSlider.closest('.music-slider')).toHaveClass('is-muted');

    fireEvent.contextMenu(musicSlider);
    expect(setMusicMuteMock).toHaveBeenLastCalledWith(false);
    expect(musicSlider.closest('.music-slider')).not.toHaveClass('is-muted');

    act(() => {
      musicMuteChangeListener?.(false);
    });
    expect(musicSlider.closest('.music-slider')).not.toHaveClass('is-muted');

    act(() => {
      musicMuteChangeListener?.(true);
    });
    expect(musicSlider.closest('.music-slider')).toHaveClass('is-muted');
    expect(musicSlider).toHaveAttribute('aria-valuetext', '-7 dB, muted');
  });

  it('hides and restores sessions in their original order', async () => {
    render(<App />);
    await screen.findByRole('slider', { name: 'Music Player volume' });

    act(() => {
      sessionChangeListener?.([
        { name: 'Music Player', volume: 0.5, muted: false },
        { name: 'Browser', volume: 0.7, muted: false },
        { name: 'Game', volume: 0.3, muted: false },
      ]);
    });
    await screen.findByRole('heading', { name: 'Game' });

    fireEvent.click(screen.getByRole('button', { name: 'Hide Browser gauge' }));

    expect(
      Array.from(document.querySelectorAll('.visible-apps .app-name')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Music Player', 'Game']);
    expect(
      screen.getByRole('slider', { name: 'Browser volume (hidden)' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Browser gauge' }));

    expect(
      Array.from(document.querySelectorAll('.visible-apps .app-name')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Music Player', 'Browser', 'Game']);
    expect(window.localStorage.getItem('audio-panel:hidden-app-names')).toBe(
      '[]',
    );
  });

  it('persists hidden sessions and keeps their volume and mute controls', async () => {
    const { unmount } = render(<App />);
    await screen.findByRole('slider', { name: 'Music Player volume' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Music Player gauge' }),
    );
    const hiddenSlider = screen.getByRole('slider', {
      name: 'Music Player volume (hidden)',
    });
    expect(window.localStorage.getItem('audio-panel:hidden-app-names')).toBe(
      '["Music Player"]',
    );

    fireEvent.keyDown(hiddenSlider, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(setAppVolume).toHaveBeenLastCalledWith('Music Player', 0.51);
    });

    fireEvent.contextMenu(hiddenSlider);
    expect(setAppMute).toHaveBeenLastCalledWith('Music Player', true);
    expect(hiddenSlider.closest('.hidden-app-volume')).toHaveClass('is-muted');

    unmount();
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole('slider', { name: 'Music Player volume (hidden)' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('slider', { name: 'Music Player volume' }),
    ).not.toBeInTheDocument();
  });

  it('matches hidden slider height and eye position to the gauge and app name', async () => {
    render(<App />);
    await screen.findByRole('slider', { name: 'Music Player volume' });

    act(() => {
      sessionChangeListener?.([
        { name: 'Music Player', volume: 0.5, muted: false },
        { name: 'Browser', volume: 0.7, muted: false },
      ]);
    });
    await screen.findByRole('slider', { name: 'Browser volume' });

    const gaugeSize = Number(
      document
        .querySelector('.app-gauge svg')
        ?.getAttribute('viewBox')
        ?.split(' ')[2],
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Music Player gauge' }),
    );
    expect(
      screen.getByRole('button', { name: 'Show Music Player gauge' }),
    ).toBeInTheDocument();
    const showGaugeButton = screen.getByRole('button', {
      name: 'Show Music Player gauge',
    });
    const hiddenAppName = within(showGaugeButton).getByRole('heading', {
      name: 'Music Player',
    });
    expect(hiddenAppName).toHaveClass('app-name', 'hidden-app-name');
    fireEvent.mouseOver(document.querySelector('.hidden-app-slider')!);
    expect(hiddenAppName).toBeInTheDocument();
    expect(showGaugeButton.querySelector('svg')).toBeInTheDocument();

    expect(document.querySelector('.hidden-app-slider-track')).toHaveStyle({
      height: `${gaugeSize}px`,
      marginBottom: '-22px',
    });
    expect(document.querySelector('.hidden-app-volume')).toHaveStyle({
      height: `${gaugeSize + 32}px`,
    });
    expect(document.querySelector('.hidden-app-slider')).toHaveStyle({
      width: '24px',
      height: `${gaugeSize * 0.69}px`,
      top: `${gaugeSize * 0.15}px`,
    });
    expect(
      screen.getByRole('button', { name: 'Show Music Player gauge' }),
    ).toHaveStyle({
      height: '44px',
    });
    expect(
      document
        .querySelector('.hidden-app-slider-track')
        ?.nextElementSibling?.classList.contains(
          'hidden-app-visibility-toggle',
        ),
    ).toBe(true);
  });

  it('places multiple hidden sessions in side-by-side columns', async () => {
    render(<App />);
    await screen.findByRole('slider', { name: 'Music Player volume' });
    act(() => {
      sessionChangeListener?.([
        { name: 'Music Player', volume: 0.5, muted: false },
        { name: 'Browser', volume: 0.7, muted: false },
        { name: 'Game', volume: 0.3, muted: false },
      ]);
    });
    await screen.findByRole('slider', { name: 'Game volume' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Music Player gauge' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide Browser gauge' }));

    const hiddenApps = document.querySelector('.hidden-apps');
    expect(hiddenApps).toHaveStyle({
      gridTemplateColumns: 'repeat(2, 56px)',
      columnGap: '32px',
    });
    expect(
      Array.from(hiddenApps?.querySelectorAll('.hidden-app-volume') ?? []).map(
        (session) =>
          session
            .querySelector('.hidden-app-visibility-toggle')
            ?.getAttribute('aria-label')
            ?.replace(/^Show | gauge$/g, ''),
      ),
    ).toEqual(['Music Player', 'Browser']);
    expect(document.querySelector('#app-volumes')).toHaveStyle({
      gridTemplateColumns: '144px minmax(0, 1fr)',
    });
  });

  it('restores gauge order while keeping hidden sessions out of view', async () => {
    const apps = [
      { name: 'Music Player', volume: 0.5, muted: false },
      { name: 'Browser', volume: 0.7, muted: false },
      { name: 'Game', volume: 0.3, muted: false },
    ];
    window.electron.audio.getAppVolumes = jest.fn().mockResolvedValue(apps);
    window.localStorage.setItem(
      'audio-panel:app-order',
      '["Game","Browser","Music Player"]',
    );
    const { unmount } = render(<App />);
    await screen.findByRole('slider', { name: 'Game volume' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Browser gauge' }));

    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('.visible-apps .app-name')).map(
          (heading) => heading.textContent,
        ),
      ).toEqual(['Game', 'Music Player']);
      expect(window.localStorage.getItem('audio-panel:app-order')).toBe(
        '["Game","Browser","Music Player"]',
      );
    });
    expect(
      screen.getByRole('slider', { name: 'Browser volume (hidden)' }),
    ).toBeInTheDocument();

    unmount();
    render(<App />);
    await screen.findByRole('slider', { name: 'Game volume' });
    expect(
      Array.from(document.querySelectorAll('.visible-apps .app-name')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Game', 'Music Player']);
  });
});
