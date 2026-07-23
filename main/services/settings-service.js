const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  language: 'Русский',
  encryptedApiKey: ''
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readRaw() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeRaw(value) {
  const target = settingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2), { mode: 0o600 });
  try { fs.chmodSync(target, 0o600); } catch { /* Windows */ }
}

function encryptKey(apiKey) {
  if (!apiKey) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(apiKey).toString('base64')}`;
  }
  return `plain:${Buffer.from(apiKey, 'utf8').toString('base64')}`;
}

function decryptKey(stored) {
  if (!stored) return '';
  try {
    const [kind, payload] = stored.split(':', 2);
    const buffer = Buffer.from(payload, 'base64');
    return kind === 'safe' ? safeStorage.decryptString(buffer) : buffer.toString('utf8');
  } catch {
    return '';
  }
}

function getPublicSettings() {
  const settings = readRaw();
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    language: settings.language,
    hasApiKey: Boolean(decryptKey(settings.encryptedApiKey)),
    storageProtected: String(settings.encryptedApiKey || '').startsWith('safe:')
  };
}

function getPrivateSettings() {
  const settings = readRaw();
  return { ...settings, apiKey: decryptKey(settings.encryptedApiKey) };
}

function updateSettings(patch = {}) {
  const current = readRaw();
  if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) current.baseUrl = patch.baseUrl.trim();
  if (typeof patch.model === 'string' && patch.model.trim()) current.model = patch.model.trim();
  if (typeof patch.language === 'string' && patch.language.trim()) current.language = patch.language.trim();
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) current.encryptedApiKey = encryptKey(patch.apiKey.trim());
  if (patch.clearApiKey === true) current.encryptedApiKey = '';
  writeRaw(current);
  return getPublicSettings();
}

module.exports = { getPublicSettings, getPrivateSettings, updateSettings, settingsPath };
