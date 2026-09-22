'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timeproof', {
  getTimesheet: () => ipcRenderer.invoke('timeproof:get-timesheet'),
  explain: (projectName) => ipcRenderer.invoke('timeproof:explain', projectName),
  approve: (projectName) => ipcRenderer.invoke('timeproof:approve', projectName),
  getPrivacy: () => ipcRenderer.invoke('timeproof:get-privacy'),
  setScreenshots: (enabled) => ipcRenderer.invoke('timeproof:set-screenshots', enabled),
});
