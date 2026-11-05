import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FF, resetStorage } from './setup.mjs';

const { store } = FF;

beforeEach(() => resetStorage());

test('fresh install creates one empty profile', async () => {
  const s = await store.load();
  assert.equal(s.profiles.length, 1);
  assert.equal(s.activeProfileId, s.profiles[0].id);
  assert.equal(s.vault, null);
});

test('migrates v1 storage without losing data', async () => {
  resetStorage({
    p1_firstName: 'João', p1_address: 'Rua X, 1', p1_password: 'segredo',
    p2_email: 'b@b.com',
    activeProfile: 2, autoFill: true, saveProfile: true,
  });
  const s = await store.load();
  assert.equal(s.profiles.length, 2);
  const [p1, p2] = s.profiles;
  assert.equal(p1.data.firstName, 'João');
  assert.equal(p1.data.street, 'Rua X, 1');
  assert.equal(p1.data.password, undefined, 'password must not stay in plain data');
  assert.equal(s.legacyPasswords[p1.id], 'segredo');
  assert.equal(p2.data.email, 'b@b.com');
  assert.equal(s.activeProfileId, p2.id);
  const raw = await chrome.storage.local.get(null);
  assert.ok(!Object.keys(raw).some(k => /^p\d_/.test(k) || k === 'autoFill'), 'v1 keys removed');
  // idempotent
  const again = await store.load();
  assert.deepEqual(again.profiles.map(p => p.id), s.profiles.map(p => p.id));
});

test('vault encrypts legacy passwords and gates them', async () => {
  resetStorage({ p1_firstName: 'A', p1_password: 'segredo' });
  await store.load();
  const key = await store.createVault('mestra123');
  let s = await store.load();
  assert.deepEqual(s.legacyPasswords, {});
  assert.ok(s.profiles[0].secret?.ct);
  assert.ok(!JSON.stringify(await chrome.storage.local.get(null)).includes('segredo'), 'no plaintext at rest');
  assert.equal(await store.readSecret(s.profiles[0], key), 'segredo');

  let payload = await store.buildPayload(s, s.profiles[0]);
  assert.equal(payload.values.password, 'segredo');

  await store.lock();
  payload = await store.buildPayload(s, s.profiles[0]);
  assert.equal(payload.values.password, undefined);
  assert.equal(payload.passwordLocked, true);

  assert.equal(await store.unlock('errada'), null);
  assert.ok(await store.unlock('mestra123'));

  await store.changeMaster('nova-senha');
  await store.lock();
  assert.equal(await store.unlock('mestra123'), null);
  const k2 = await store.unlock('nova-senha');
  s = await store.load();
  assert.equal(await store.readSecret(s.profiles[0], k2), 'segredo');

  await store.removeVault();
  s = await store.load();
  assert.equal(s.vault, null);
  assert.equal(s.profiles[0].secret, null);
});

test('payload carries custom fields and mappings', async () => {
  const s = await store.load();
  s.customFields = [{ id: 'cf_rg', label: 'RG', patterns: 'rg' }];
  s.profiles[0].custom = { cf_rg: '12.345.678-9' };
  s.siteRules = { 'https://a.com': { autoFill: true, mappings: { '#x': 'email' } }, 'https://b.com': { autoFill: true, mappings: {} } };
  const payload = await store.buildPayload(s, s.profiles[0]);
  assert.deepEqual(payload.custom.map(c => c.value), ['12.345.678-9']);
  assert.deepEqual(payload.mappings, { 'https://a.com': { '#x': 'email' } });
});

test('crypto round trip and tamper detection', async () => {
  const salt = FF.crypto.randomB64(16);
  const key = await FF.crypto.deriveKey('pw', salt);
  const box = await FF.crypto.encrypt(key, 'olá');
  assert.equal(await FF.crypto.decrypt(key, box), 'olá');
  const bad = { ...box, ct: box.ct.slice(0, -4) + 'AAAA' };
  await assert.rejects(FF.crypto.decrypt(key, bad));
});
