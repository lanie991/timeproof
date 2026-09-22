'use strict';

const { redactSample } = require('./privacy');

/**
 * Polls the active window on an interval and appends redacted samples to
 * the store. Isolated from Electron specifics behind a small `getActiveWindow`
 * dependency so it can be unit tested with a fake; main.js wires the real
 * implementations (active-win + Electron's powerMonitor) together.
 *
 * getActiveWindow(): Promise<{ app: string, title: string }>
 * getIdleSeconds(): number
 */
class ActivityTracker {
  constructor({ store, settings, getActiveWindow, getIdleSeconds, intervalMs = 15000 }) {
    this.store = store;
    this.settings = settings;
    this.getActiveWindow = getActiveWindow;
    this.getIdleSeconds = getIdleSeconds;
    this.intervalMs = intervalMs;
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._poll(), this.intervalMs);
    this._poll();
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
  }

  async _poll() {
    try {
      const idleSeconds = this.getIdleSeconds();
      const win = idleSeconds * 1000 < this._idleThresholdMs()
        ? await this.getActiveWindow()
        : { app: null, title: null };

      const rawSample = {
        ts: Date.now(),
        app: win && win.app,
        title: win && win.title,
        idleSeconds,
        event: idleSeconds * 1000 >= this._idleThresholdMs() ? 'idle' : 'active',
      };

      this.store.append(redactSample(rawSample, this.settings));
    } catch (err) {
      // Tracking must never crash the app; swallow and try again next tick.
      // eslint-disable-next-line no-console
      console.error('[ActivityTracker] poll failed:', err.message);
    }
  }

  recordSystemEvent(event) {
    this.store.append({ ts: Date.now(), app: null, title: null, idleSeconds: 0, event });
  }

  _idleThresholdMs() {
    return 5 * 60 * 1000;
  }
}

module.exports = { ActivityTracker };
