'use strict';

const { app, BrowserWindow, Tray, powerMonitor, ipcMain, safeStorage } = require('electron');
const path = require('path');

const { ActivityStore } = require('./store');
const { ActivityTracker } = require('./activityTracker');
const { buildEvidenceBlocks } = require('./timeEvidenceEngine');
const { buildTimesheet, explainProject, approveLine } = require('./timesheetBuilder');
const { DEFAULT_SETTINGS, describeCollection } = require('./privacy');

// Two processes appending to the same activity log would race on the hash
// chain and corrupt it, so only one instance of the app may run at a time.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const DATA_DIR = path.join(app.getPath('userData'), 'activity');
const store = new ActivityStore(DATA_DIR, { safeStorage });

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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  // This app never needs to navigate away from its own local UI or open
  // new windows/tabs — deny both outright rather than trying to allowlist.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // Surface renderer console warnings/errors (e.g. a CSP violation) in the
  // main process log, since devtools aren't opened by default.
  mainWindow.webContents.on('console-message', (_evt, level, message) => {
    if (level >= 2) console.error('[renderer]', message);
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

  // Every IPC handler validates its own input — the renderer is untrusted
  // even though it's our own UI, since it runs with sandbox+contextIsolation
  // specifically so a future compromised dependency there can't reach Node.
  ipcMain.handle('timeproof:get-timesheet', () => currentTimesheet());

  ipcMain.handle('timeproof:explain', (_evt, projectName) => {
    if (typeof projectName !== 'string' || !projectName) return null;
    return explainProject(currentTimesheet(), projectName);
  });

  ipcMain.handle('timeproof:approve', (_evt, projectName) => {
    if (typeof projectName !== 'string' || !projectName) return null;
    return approveLine(currentTimesheet(), projectName);
  });

  ipcMain.handle('timeproof:get-privacy', () => describeCollection(settings));

  ipcMain.handle('timeproof:set-screenshots', (_evt, enabled) => {
    settings = { ...settings, screenshotsEnabled: enabled === true };
    return describeCollection(settings);
  });

  ipcMain.handle('timeproof:verify-integrity', () => ({
    encryptedAtRest: safeStorage.isEncryptionAvailable(),
    ...store.verifyDay(todayStr()),
  }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (tracker) tracker.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (tracker) tracker.stop();
});

module.exports = { DATA_DIR };
