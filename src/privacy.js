'use strict';

/**
 * Privacy-first defaults. Screenshots are off unless the employee (or
 * their org policy) explicitly turns them on, and even then this module
 * never records anything from an excluded personal app.
 */
const DEFAULT_SETTINGS = {
  screenshotsEnabled: false,
  screenshotBlurEnabled: true,
  screenshotIntervalMinutes: 15,
  // App/title substrings (case-insensitive) that are never recorded in
  // detail — only that "personal activity" occurred, so idle time isn't
  // misread as slacking without exposing what was actually on screen.
  excludedApps: [
    'banking', 'chase', 'bank of america', 'wells fargo',
    'health', 'mychart', 'therapy',
    'whatsapp', 'signal', 'imessage', 'messages',
    '1password', 'bitwarden', 'keychain', 'password',
  ],
};

function isExcluded(app, title, settings) {
  const haystack = `${app || ''} ${title || ''}`.toLowerCase();
  return settings.excludedApps.some((needle) => haystack.includes(needle.toLowerCase()));
}

/**
 * Apply the privacy policy to a raw sample before it is ever written to
 * disk. Excluded activity is reduced to a generic label; nothing else
 * about it (title, document name, correspondents) is retained.
 */
function redactSample(sample, settings = DEFAULT_SETTINGS) {
  if (isExcluded(sample.app, sample.title, settings)) {
    return { ...sample, app: 'Personal', title: null, redacted: true };
  }
  return sample;
}

/**
 * What the employee sees under "What's being collected" — the whole
 * point of positioning this as auditable, not surveillance.
 */
function describeCollection(settings = DEFAULT_SETTINGS) {
  return {
    collects: [
      'Active application name and window/document title',
      'Start and end time of each activity segment',
      'Idle periods, screen lock/unlock, login/logout',
      settings.screenshotsEnabled
        ? `Screenshots every ${settings.screenshotIntervalMinutes} minutes (blurred: ${settings.screenshotBlurEnabled})`
        : 'Screenshots: OFF',
    ],
    neverCollects: [
      'Keystrokes or typed content',
      'Passwords or credential-manager contents',
      'Personal apps and sites (see excluded list)',
    ],
    excludedApps: settings.excludedApps,
  };
}

module.exports = { DEFAULT_SETTINGS, isExcluded, redactSample, describeCollection };
