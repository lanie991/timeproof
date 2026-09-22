'use strict';

const { app, BrowserWindow, Tray, powerMonitor, ipcMain } = require('electron');
const path = require('path');
const os = require('os');

const { ActivityStore } = require('./store');
const { ActivityTracker } = require('./activityTracker');
const { buildEvidenceBlocks } = require('./timeEvidenceEngine');
const { buildTimesheet, explainProject, approveLine } = require('./timesheetBuilder');
const { DEFAULT_SETTINGS, describeCollection } = require('./privacy');

const DATA_DIR = path.join(app.getPath('userData'), 'activity');
const store = new ActivityStore(DATA_DIR);

let settings = { ...DEFAULT_SETTINGS };
let projectRules = [
  // Example: { name: 'Client ABC', keywords: ['client abc', 'abc-corp'] }
];

let mainWindow = null;
let tray = null;
let tracker = null;

function getActiveWindow() {
  // Optional native dependency; if it's not installed (e.g. running the
  // core logic headless in CI), fall back to an "Unknown" sample rather
  // than crashing the tracker.
  try {
    // eslint-disable-next-line global-require
    const activeWin = require('active-win');
    return activeWin().then((w) => ({
      app: (w && (w.owner ? w.owner.name : w.appName)) || 'Unknown',
      title: (w && w.title) || '',
    }));
  } catch (err) {
    return Promise.resolve({ app: 'Unknown', title: '' });
  }
}

function getIdleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch (err) {
    return 0;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    title: 'TimeProof',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '..', 'renderer', 'tray-icon.png'));
    tray.setToolTip('TimeProof — recording activity');
  } catch (err) {
    // Missing icon asset shouldn't block the app from running.
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentTimesheet() {
  const samples = store.readDay(todayStr());
  const blocks = buildEvidenceBlocks(samples, { projectRules });
  return buildTimesheet(blocks, { weekLabel: todayStr() });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  tracker = new ActivityTracker({
    store,
    settings,
    getActiveWindow,
    getIdleSeconds,
    intervalMs: 15000,
  });
  tracker.start();

  powerMonitor.on('lock-screen', () => tracker.recordSystemEvent('lock'));
  powerMonitor.on('unlock-screen', () => tracker.recordSystemEvent('unlock'));
  powerMonitor.on('suspend', () => tracker.recordSystemEvent('idle'));
  powerMonitor.on('resume', () => tracker.recordSystemEvent('unlock'));

  ipcMain.handle('timeproof:get-timesheet', () => currentTimesheet());
  ipcMain.handle('timeproof:explain', (_evt, projectName) =>
    explainProject(currentTimesheet(), projectName)
  );
  ipcMain.handle('timeproof:approve', (_evt, projectName) =>
    approveLine(currentTimesheet(), projectName)
  );
  ipcMain.handle('timeproof:get-privacy', () => describeCollection(settings));
  ipcMain.handle('timeproof:set-screenshots', (_evt, enabled) => {
    settings = { ...settings, screenshotsEnabled: !!enabled };
    return describeCollection(settings);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (tracker) tracker.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (tracker) tracker.stop();
});

module.exports = { DATA_DIR, os };
