// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer } from 'electron';

const electronHandler = {
  audio: {
    getMainVolume() {
      return ipcRenderer.invoke('get-main-volume');
    },
    setMainVolume(volume: number) {
      return ipcRenderer.invoke('set-main-volulme', volume);
    },
    onMainVolumeChanged(callback: (volume: number) => void) {
      const listener = (_event: Electron.IpcRendererEvent, volume: number) =>
        callback(volume);
      ipcRenderer.on('main-volume-changed', listener);
      return () => {
        ipcRenderer.removeListener('main-volume-changed', listener);
      };
    },
    getMainMute() {
      return ipcRenderer.invoke('get-main-mute') as Promise<boolean>;
    },
    setMainMute(muted: boolean) {
      return ipcRenderer.invoke('set-main-mute', muted) as Promise<void>;
    },
    onMainMuteChanged(callback: (muted: boolean) => void) {
      const listener = (_event: Electron.IpcRendererEvent, muted: boolean) =>
        callback(muted);
      ipcRenderer.on('main-mute-changed', listener);
      return () => {
        ipcRenderer.removeListener('main-mute-changed', listener);
      };
    },
    getMusicVolume() {
      return ipcRenderer.invoke('get-music-volume') as Promise<number>;
    },
    setMusicVolume(volume: number) {
      return ipcRenderer.invoke('set-music-volume', volume) as Promise<void>;
    },
    onMusicVolumeChanged(callback: (volume: number) => void) {
      const listener = (_event: Electron.IpcRendererEvent, volume: number) =>
        callback(volume);
      ipcRenderer.on('music-volume-changed', listener);
      return () => {
        ipcRenderer.removeListener('music-volume-changed', listener);
      };
    },
    getMusicMute() {
      return ipcRenderer.invoke('get-music-mute') as Promise<boolean>;
    },
    setMusicMute(muted: boolean) {
      return ipcRenderer.invoke('set-music-mute', muted) as Promise<void>;
    },
    onMusicMuteChanged(callback: (muted: boolean) => void) {
      const listener = (_event: Electron.IpcRendererEvent, muted: boolean) =>
        callback(muted);
      ipcRenderer.on('music-mute-changed', listener);
      return () => {
        ipcRenderer.removeListener('music-mute-changed', listener);
      };
    },
    getAppVolumes() {
      return ipcRenderer.invoke('get-app-volumes') as Promise<
        { name: string; volume: number; muted: boolean }[]
      >;
    },
    onAppSessionsChanged(
      callback: (
        apps: { name: string; volume: number; muted: boolean }[],
      ) => void,
    ) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        apps: { name: string; volume: number; muted: boolean }[],
      ) => callback(apps);
      ipcRenderer.on('app-sessions-changed', listener);
      return () => {
        ipcRenderer.removeListener('app-sessions-changed', listener);
      };
    },
    setAppVolume(name: string, volume: number) {
      return ipcRenderer.invoke('set-app-volume', { name, volume });
    },
    setAppMute(name: string, muted: boolean) {
      return ipcRenderer.invoke('set-app-mute', { name, muted });
    },
    onAppVolumeChanged(callback: (name: string, volume: number) => void) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        { name, volume }: { name: string; volume: number },
      ) => callback(name, volume);
      ipcRenderer.on('app-volume-changed', listener);
      return () => {
        ipcRenderer.removeListener('app-volume-changed', listener);
      };
    },
    onAppMuteChanged(callback: (name: string, muted: boolean) => void) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        { name, muted }: { name: string; muted: boolean },
      ) => callback(name, muted);
      ipcRenderer.on('app-mute-changed', listener);
      return () => {
        ipcRenderer.removeListener('app-mute-changed', listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
