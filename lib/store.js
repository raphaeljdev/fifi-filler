// lib/store.js — storage schema, v1 migration, password vault, fill payloads.
// Classic script shared by popup and background (global FF).
//
// chrome.storage.local (schema 2):
//   profiles:        [{ id, name, data: {firstName…}, custom: {cf_id: value}, secret: {iv, ct} | null }]
//   activeProfileId: string
//   customFields:    [{ id, label, patterns }]
//   settings:        { highlight: boolean }
//   siteRules:       { [origin]: { autoFill: boolean, mappings: { [cssSelector]: fieldKey } } }
//   vault:           { salt, verifier: {iv, ct} } | null   (master password check)
//   legacyPasswords: { [profileId]: string }  plaintext passwords migrated from v1,
//                    kept only until the user creates a vault or discards them.
// chrome.storage.session (memory only, trusted contexts):
//   vaultKey: base64 raw AES key while the vault is unlocked.
(function (root) {
  'use strict';
  const FF = (root.FF = root.FF || {});
  const local = chrome.storage.local;
  const session = chrome.storage.session;

  const SCHEMA = 2;
  const VERIFIER = 'fifi-filler-vault';
  const DEFAULT_SETTINGS = { highlight: true };
  const V1_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'password', 'address', 'city', 'state', 'zip',
    'cpf', 'dateOfBirth', 'cie', 'validityDate', 'institutionName', 'course'];

  function newId(prefix = 'p') {
    return `${prefix}_${FF.crypto.randomB64(6).replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  function defaultName(n) {
    return chrome.i18n?.getMessage('profileDefaultName', [String(n)]) || `Perfil ${n}`;
  }

  function newProfile(name, data = {}) {
    return { id: newId(), name, data: { ...data }, custom: {}, secret: null };
  }

  /** Converts v1 storage (p1_*, p2_*, activeProfile, autoFill, saveProfile) into schema 2. Idempotent. */
  async function migrate() {
    const all = await local.get(null);
    if (all.schema === SCHEMA) return;

    const profiles = [];
    const legacyPasswords = {};
    let activeProfileId = null;
    for (const n of [1, 2]) {
      const data = {};
      for (const f of V1_FIELDS) {
        const v = all[`p${n}_${f}`];
        if (!v) continue;
        if (f === 'password') continue;
        data[f === 'address' ? 'street' : f] = v;
      }
      const pw = all[`p${n}_password`];
      if (!Object.keys(data).length && !pw && n === 2) continue;
      const p = newProfile(defaultName(n), data);
      if (pw) legacyPasswords[p.id] = pw;
      profiles.push(p);
      if (all.activeProfile === n) activeProfileId = p.id;
    }

    // Write the new schema first, then drop v1 keys, so a failure never loses data.
    await local.set({
      schema: SCHEMA,
      profiles,
      activeProfileId: activeProfileId || profiles[0].id,
      customFields: all.customFields || [],
      settings: { ...DEFAULT_SETTINGS },
      siteRules: {},
      vault: null,
      legacyPasswords,
    });
    const v1Keys = Object.keys(all).filter(k => /^p\d+_/.test(k) || ['activeProfile', 'autoFill', 'saveProfile'].includes(k));
    if (v1Keys.length) await local.remove(v1Keys);
  }

  async function load() {
    await migrate();
    const s = await local.get(['profiles', 'activeProfileId', 'customFields', 'settings', 'siteRules', 'vault', 'legacyPasswords']);
    s.profiles = s.profiles?.length ? s.profiles : [newProfile(defaultName(1))];
    s.customFields = s.customFields || [];
    s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    s.siteRules = s.siteRules || {};
    s.legacyPasswords = s.legacyPasswords || {};
    if (!s.profiles.some(p => p.id === s.activeProfileId)) s.activeProfileId = s.profiles[0].id;
    return s;
  }

  function set(obj) {
    return local.set(obj);
  }

  // ── Vault ──────────────────────────────────────────────────────────────────
  async function getSessionKey() {
    const { vaultKey } = await session.get('vaultKey');
    return vaultKey ? FF.crypto.importKey(vaultKey) : null;
  }

  async function setSessionKey(key) {
    if (key) await session.set({ vaultKey: await FF.crypto.exportKey(key) });
    else await session.remove('vaultKey');
  }

  async function readSecret(profile, key) {
    if (!profile.secret || !key) return '';
    try {
      return JSON.parse(await FF.crypto.decrypt(key, profile.secret)).password || '';
    } catch {
      return '';
    }
  }

  async function sealSecret(password, key) {
    return password ? FF.crypto.encrypt(key, JSON.stringify({ password })) : null;
  }

  /** Creates the vault and encrypts any v1 plaintext passwords into their profiles. */
  async function createVault(master) {
    const salt = FF.crypto.randomB64(16);
    const key = await FF.crypto.deriveKey(master, salt);
    const s = await load();
    for (const p of s.profiles) {
      const legacy = s.legacyPasswords[p.id];
      if (legacy) p.secret = await sealSecret(legacy, key);
    }
    await local.set({
      vault: { salt, verifier: await FF.crypto.encrypt(key, VERIFIER) },
      profiles: s.profiles,
      legacyPasswords: {},
    });
    await setSessionKey(key);
    return key;
  }

  /** Returns the key, or null when the master password is wrong. */
  async function unlock(master) {
    const { vault } = await local.get('vault');
    if (!vault) return null;
    const key = await FF.crypto.deriveKey(master, vault.salt);
    try {
      if ((await FF.crypto.decrypt(key, vault.verifier)) !== VERIFIER) return null;
    } catch {
      return null;
    }
    await setSessionKey(key);
    return key;
  }

  async function lock() {
    await setSessionKey(null);
  }

  /** Re-encrypts every saved password under a new master password. Requires the vault unlocked. */
  async function changeMaster(newMaster) {
    const oldKey = await getSessionKey();
    if (!oldKey) throw new Error('locked');
    const s = await load();
    const salt = FF.crypto.randomB64(16);
    const key = await FF.crypto.deriveKey(newMaster, salt);
    for (const p of s.profiles) p.secret = await sealSecret(await readSecret(p, oldKey), key);
    await local.set({ vault: { salt, verifier: await FF.crypto.encrypt(key, VERIFIER) }, profiles: s.profiles });
    await setSessionKey(key);
  }

  /** Deletes the vault and every saved password. */
  async function removeVault() {
    const s = await load();
    for (const p of s.profiles) p.secret = null;
    await local.set({ vault: null, profiles: s.profiles });
    await setSessionKey(null);
  }

  // ── Payloads ───────────────────────────────────────────────────────────────
  function mappingsByOrigin(siteRules) {
    const out = {};
    for (const [origin, rule] of Object.entries(siteRules)) {
      if (rule.mappings && Object.keys(rule.mappings).length) out[origin] = rule.mappings;
    }
    return out;
  }

  /**
   * Builds what content scripts receive to fill a page.
   * Password is included only when the vault is unlocked.
   */
  async function buildPayload(s, profile) {
    const key = await getSessionKey();
    const values = { ...profile.data };
    const password = await readSecret(profile, key);
    if (password) values.password = password;
    return {
      values,
      custom: s.customFields
        .map(cf => ({ ...cf, value: profile.custom?.[cf.id] || '' }))
        .filter(cf => cf.value),
      mappings: mappingsByOrigin(s.siteRules),
      highlight: s.settings.highlight,
      passwordLocked: Boolean(profile.secret && !key),
    };
  }

  function buildFakePayload(s, values) {
    return { values, custom: [], mappings: mappingsByOrigin(s.siteRules), highlight: s.settings.highlight };
  }

  FF.store = {
    SCHEMA, newId, newProfile, migrate, load, set,
    getSessionKey, readSecret, sealSecret, createVault, unlock, lock, changeMaster, removeVault,
    buildPayload, buildFakePayload,
  };
})(globalThis);
