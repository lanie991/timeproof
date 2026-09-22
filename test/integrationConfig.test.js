'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadIntegrationConfig, saveIntegrationConfig } = require('../src/integrationConfig');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeproof-integration-')), 'integration-config.json');
}

function fakeSafeStorage() {
  const KEY = 0x42;
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ KEY)),
    decryptString: (b) => Buffer.from(Buffer.from(b).map((byte) => byte ^ KEY)).toString('utf8'),
  };
}

describe('integrationConfig', () => {
  it('returns empty defaults when no file exists yet', () => {
    expect(loadIntegrationConfig(tmpFile())).toEqual({ endpointUrl: '', employeeId: '', apiKey: '' });
  });

  it('round-trips endpoint/employeeId without an API key', () => {
    const file = tmpFile();
    saveIntegrationConfig(file, { endpointUrl: 'https://internal.example.com/api', employeeId: 'j.doe' });
    expect(loadIntegrationConfig(file)).toEqual({
      endpointUrl: 'https://internal.example.com/api',
      employeeId: 'j.doe',
      apiKey: '',
    });
  });

  it('never stores the API key in plaintext in the file', () => {
    const file = tmpFile();
    saveIntegrationConfig(file, { endpointUrl: 'https://x', apiKey: 'super-secret-token' });
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('super-secret-token');
  });

  it('round-trips an API key through a real encryption backend', () => {
    const file = tmpFile();
    const safeStorage = fakeSafeStorage();
    saveIntegrationConfig(file, { endpointUrl: 'https://x', apiKey: 'super-secret-token' }, { safeStorage });
    expect(loadIntegrationConfig(file, { safeStorage }).apiKey).toBe('super-secret-token');
  });

  it('treats a corrupt file as empty config rather than throwing', () => {
    const file = tmpFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not json{{', 'utf8');
    expect(loadIntegrationConfig(file)).toEqual({ endpointUrl: '', employeeId: '', apiKey: '' });
  });
});
