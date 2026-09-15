const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('moneyDanceDesktop', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('desktop:state'),
  saveSettings: settings => ipcRenderer.invoke('desktop:settings', settings),
  createPet: mode => ipcRenderer.invoke('desktop:create-pet', mode),
  usePet: () => ipcRenderer.invoke('desktop:use-pet'),
  resetPet: () => ipcRenderer.invoke('desktop:reset-pet'),
  cancelExtraction: () => ipcRenderer.invoke('desktop:cancel-extraction'),
  importPack: () => ipcRenderer.invoke('desktop:import-pack'),
  usePack: (id, bindings) => ipcRenderer.invoke('desktop:use-pack', id, bindings),
  savePackBindings: (id, bindings) => ipcRenderer.invoke('desktop:pack-bindings', id, bindings),
  savePackTemplate: () => ipcRenderer.invoke('desktop:pack-template'),
  publish: snapshot => ipcRenderer.send('desktop:snapshot', snapshot),
  action: action => ipcRenderer.invoke('desktop:action', action),
  openPage: route => ipcRenderer.invoke('desktop:open', route),
  setInteractive: value => ipcRenderer.send('desktop:interactive', value),
  drag: phase => ipcRenderer.send('desktop:drag', phase),
  layout: metrics => ipcRenderer.invoke('desktop:layout', metrics),
  onLayout: callback => subscribe('desktop:layout-changed', callback),
  onState: callback => subscribe('desktop:state-changed', callback),
  onNavigate: callback => subscribe('desktop:navigate', callback),
  onProgress: callback => subscribe('desktop:progress', callback),
});
