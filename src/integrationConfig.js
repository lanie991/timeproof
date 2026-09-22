'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Config for submitting timesheets to the company's internal system:
 * an endpoint URL, an optional employee identifier, and an optional API
 * key. The API key is encrypted at rest the same way activity data is
 * (see store.js) — it's a credential, so it gets the same treatment.
 */
function noEncryption() {
  return {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s, 'utf8'),
    decryptString: (b) => b.toString('utf8'),
  };
}

function encodeSecret(safeStorage, plain) {
  if (!plain) return null;
  const encrypted = safeStorage.isEncryptionAvailable();
  const buf = encrypted ? safeStorage.encryptString(plain) : Buffer.from(plain, 'utf8');
  return `${encrypted ? 'ENC' : 'PLAIN'}:${buf.toString('base64')}`;
}

function decodeSecret(safeStorage, encoded) {
  if (!encoded) return '';
  const sep = encoded.indexOf(':');
  const prefix = encoded.slice(0, sep);
  const buf = Buffer.from(encoded.slice(sep + 1), 'base64');
  return prefix === 'ENC' ? safeStorage.decryptString(buf) : buf.toString('utf8');
}

function loadIntegrationConfig(filePath, { safeStorage } = {}) {
  const ss = safeStorage || noEncryption();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      endpointUrl: typeof raw.endpointUrl === 'string' ? raw.endpointUrl : '',
      employeeId: typeof raw.employeeId === 'string' ? raw.employeeId : '',
      apiKey: decodeSecret(ss, raw.apiKeySecret),
    };
  } catch (err) {
    return { endpointUrl: '', employeeId: '', apiKey: '' };
  }
}

function saveIntegrationConfig(filePath, config, { safeStorage } = {}) {
  const ss = safeStorage || noEncryption();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record = {
    endpointUrl: config.endpointUrl || '',
    employeeId: config.employeeId || '',
    apiKeySecret: config.apiKey ? encodeSecret(ss, config.apiKey) : null,
  };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

module.exports = { loadIntegrationConfig, saveIntegrationConfig };
