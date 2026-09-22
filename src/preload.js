'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timeproof', {
  getTimesheet: () => ipcRenderer.invoke('timeproof:get-timesheet'),
  explain: (projectName) => ipcRenderer.invoke('timeproof:explain', projectName),
  approve: (projectName) => ipcRenderer.invoke('timeproof:approve', projectName),
  getPrivacy: () => ipcRenderer.invoke('timeproof:get-privacy'),
  setScreenshots: (enabled) => ipcRenderer.invoke('timeproof:set-screenshots', enabled),
  verifyIntegrity: () => ipcRenderer.invoke('timeproof:verify-integrity'),
  getProjects: () => ipcRenderer.invoke('timeproof:get-projects'),
  addProject: (input) => ipcRenderer.invoke('timeproof:add-project', input),
  removeProject: (name) => ipcRenderer.invoke('timeproof:remove-project', name),
  getIntegrationConfig: () => ipcRenderer.invoke('timeproof:get-integration-config'),
  setIntegrationConfig: (input) => ipcRenderer.invoke('timeproof:set-integration-config', input),
  submitTimesheet: () => ipcRenderer.invoke('timeproof:submit-timesheet'),
});
