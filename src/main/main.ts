/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build`, this file is compiled to
 * `./release/app/dist/main/main.js` using electron-vite.
 */
import path from 'path';
import { app, BrowserWindow, screen, shell, ipcMain } from 'electron';
import log from 'electron-log';
import { resolveHtmlPath } from './util';
import startAutoUpdates from './updates';
import type { AudioSession, Device } from 'native-sound-mixer';
import {
  Voicemeeter,
  BusProperties,
  StripProperties,
} from 'voicemeeter-connector';

const { default: SoundMixer, DeviceType } =
  require('native-sound-mixer') as typeof import('native-sound-mixer');

let mainWindow: BrowserWindow | null = null;
let vm: Voicemeeter;
let appAudioDevice: Device | null = null;
let appSessionsChangeHandler: number | null = null;
const appVolumeHandlers: { session: AudioSession; handler: number }[] = [];
const appMuteHandlers: { session: AudioSession; handler: number }[] = [];

if (process.env.NODE_ENV === 'production') {
  process.setSourceMapsEnabled(true);
}

const getPanelCords = () => {
  const displays = screen.getAllDisplays();
  const panel = displays.find((display) => display.bounds.height === 440);
  //const panel = displays.find((display) => display.bounds.height === 1440);
  return panel?.bounds;
  /*return {
    x: panel?.bounds.x,
    y: panel?.bounds.y,
    width: 1920,
    height: 440,
  }; */
};

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (false) {
  void import('electron-debug')
    .then(({ default: debug }) => debug())
    .catch(console.error);
}

const createWindow = async () => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  vm = await Voicemeeter.init();
  vm.connect();
  vm.attachChangeEvent(() => {
    mainWindow?.webContents.send('main-volume-changed', getMainVolume());
    mainWindow?.webContents.send('main-mute-changed', getMainMuted());
    mainWindow?.webContents.send('music-volume-changed', getMusicVolume());
    mainWindow?.webContents.send('music-mute-changed', getMusicMuted());
  });

  mainWindow = new BrowserWindow({
    frame: false,
    fullscreen: true,
    ...getPanelCords(),
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    vm?.disconnect();
  });

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(resolveHtmlPath('index.html'));
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function reportWindowError(error: unknown) {
  log.error('Failed to create the application window', error);
  mainWindow?.destroy();
  mainWindow = null;
}

function onActivate() {
  // Reopening a macOS window must not initialize another updater.
  if (mainWindow === null) {
    void createWindow().catch(reportWindowError);
  }
}

app
  .whenReady()
  .then(async () => {
    await createWindow();
    startAutoUpdates();
    app.on('activate', onActivate);
  })
  .catch((error: unknown) => {
    reportWindowError(error);
    app.quit();
  });

ipcMain.handle('get-main-volume', async () => {
  return getMainVolume();
});

ipcMain.handle('get-main-mute', async () => {
  return getMainMuted();
});

ipcMain.handle('get-music-mute', async () => {
  return getMusicMuted();
});

ipcMain.handle('get-music-volume', async () => {
  return getMusicVolume();
});

ipcMain.handle('set-main-volulme', async (_event, volume: number) => {
  await vm.setBusParameter(0, BusProperties.Gain, volume);
});

ipcMain.handle('set-main-mute', async (_event, muted: boolean) => {
  await vm.setBusParameter(0, BusProperties.Mute, muted ? 1 : 0);
});

ipcMain.handle('set-music-volume', async (_event, volume: number) => {
  await vm.setStripParameter(0, StripProperties.Gain, volume);
});

ipcMain.handle('set-music-mute', async (_event, muted: boolean) => {
  await vm.setStripParameter(0, StripProperties.Mute, muted ? 1 : 0);
});

function getMainVolume() {
  return vm.getBusParameter(0, BusProperties.Gain);
}

function getMainMuted() {
  const muteValue = vm.getBusParameter(0, BusProperties.Mute);
  return Number.parseFloat(String(muteValue).trim()) === 1;
}

function getMusicVolume() {
  const rawVolume = vm.getStripParameter(0, StripProperties.Gain);
  const volume =
    typeof rawVolume === 'number' ? rawVolume : Number.parseFloat(rawVolume);

  if (!Number.isFinite(volume)) {
    throw new Error(`Invalid Voicemeeter music gain: ${rawVolume}`);
  }

  return volume;
}

function getMusicMuted() {
  const muteValue = vm.getStripParameter(0, StripProperties.Mute);
  return Number.parseFloat(String(muteValue).trim()) === 1;
}

function getAppAudioDevice() {
  if (!appAudioDevice) {
    appAudioDevice = SoundMixer.getDefaultDevice(DeviceType.RENDER);
  }
  return appAudioDevice;
}

function refreshAppVolumes(notifyRenderer: boolean) {
  const device = getAppAudioDevice();
  const sessions = device.sessions.filter((session) => session.name !== '');

  appVolumeHandlers.forEach(({ session, handler }) => {
    session.removeListener('volume', handler);
  });
  appVolumeHandlers.length = 0;
  appMuteHandlers.forEach(({ session, handler }) => {
    session.removeListener('mute', handler);
  });
  appMuteHandlers.length = 0;

  const apps = sessions.map((session) => {
    const handler = session.on('volume', (volume) => {
      mainWindow?.webContents.send('app-volume-changed', {
        name: session.name,
        volume,
      });
    });
    appVolumeHandlers.push({ session, handler });

    const muteHandler = session.on('mute', (muted: boolean) => {
      mainWindow?.webContents.send('app-mute-changed', {
        name: session.name,
        muted,
      });
    });
    appMuteHandlers.push({ session, handler: muteHandler });

    return { name: session.name, volume: session.volume, muted: session.mute };
  });

  if (notifyRenderer) {
    mainWindow?.webContents.send('app-sessions-changed', apps);
  }

  return apps;
}

function watchAppSessionChanges() {
  if (appSessionsChangeHandler !== null) {
    return;
  }

  const device = getAppAudioDevice();
  appSessionsChangeHandler = device.on('sessions', () => {
    refreshAppVolumes(true);
  });
}

function removeAppSessionListeners() {
  if (appAudioDevice && appSessionsChangeHandler !== null) {
    appAudioDevice.removeListener('sessions', appSessionsChangeHandler);
    appSessionsChangeHandler = null;
  }

  appVolumeHandlers.forEach(({ session, handler }) => {
    session.removeListener('volume', handler);
  });
  appVolumeHandlers.length = 0;
  appMuteHandlers.forEach(({ session, handler }) => {
    session.removeListener('mute', handler);
  });
  appMuteHandlers.length = 0;
}

app.on('before-quit', removeAppSessionListeners);

ipcMain.handle('get-app-volumes', async () => {
  watchAppSessionChanges();
  return refreshAppVolumes(false);
});

ipcMain.handle(
  'set-app-volume',
  async (_event, { name, volume }: { name: string; volume: number }) => {
    const appSession = appVolumeHandlers.find(
      ({ session }) => session.name === name,
    );
    if (appSession) {
      appSession.session.volume = volume;
    }
  },
);

ipcMain.handle(
  'set-app-mute',
  async (_event, { name, muted }: { name: string; muted: boolean }) => {
    const appSession = appMuteHandlers.find(
      ({ session }) => session.name === name,
    );
    if (appSession) {
      appSession.session.mute = muted;
    }
  },
);
