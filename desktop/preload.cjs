const { contextBridge, ipcRenderer } = require('electron')

// window.watchlist: what the app (src/lib/storage.ts DesktopBridge) can ask the desktop side for.
contextBridge.exposeInMainWorld('watchlist', {
  platform: process.platform,
  version: ipcRenderer.sendSync('version'),
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  setReminders: (list) => ipcRenderer.send('reminders:set', list),
  notifyNow: (title, body) => ipcRenderer.send('notify', title, body),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
  cache: {
    get: (key) => ipcRenderer.invoke('cache:get', key),
    set: (key, json) => ipcRenderer.invoke('cache:set', key, json),
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  wallpaper: {
    get: () => ipcRenderer.invoke('wallpaper:get'),
    set: (dataUrl) => ipcRenderer.invoke('wallpaper:set', dataUrl)
  },
  openExternal: (url) => ipcRenderer.send('open-external', url),
  google: {
    configured: ipcRenderer.sendSync('google:configured'),
    signIn: () => ipcRenderer.invoke('google:sign-in'),
    signOut: () => ipcRenderer.invoke('google:sign-out'),
    fetch: (url, init) => ipcRenderer.invoke('google:fetch', url, init)
  },
  updater: {
    status: () => ipcRenderer.invoke('update:status'),
    check: (quiet) => ipcRenderer.invoke('update:check', quiet),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    setAuto: (enabled) => ipcRenderer.send('update:auto', enabled),
    onChange: (cb) => {
      const listener = (_e, status) => cb(status)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.off('update:status', listener)
    }
  }
})
