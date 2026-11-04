// background.js — service worker. Owns form filling (popup, shortcut, context
// menu), per-site auto-fill registration and field mappings.
importScripts('lib/br.js', 'lib/fields.js', 'lib/fake.js', 'lib/crypto.js', 'lib/store.js');

const CONTENT_FILES = ['lib/br.js', 'lib/fields.js', 'content.js'];
const AUTOFILL_SCRIPT_ID = 'ff-autofill';
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// ── Injection helpers ────────────────────────────────────────────────────────

async function inject(tabId, frameIds) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: CONTENT_FILES });
  } catch (e) {
    if (frameIds) throw e;
    // Some frames are off-limits (no permission): fall back to the top frame.
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: CONTENT_FILES });
  }
}

function run(tabId, frameIds, func, args = []) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  return chrome.scripting.executeScript({ target, func, args }).catch(() =>
    chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func, args }));
}

/** Scans every frame; returns {frameId, fields} of the best one (focused frame wins). */
async function bestFrame(tabId, payload) {
  await inject(tabId);
  const results = await run(tabId, null, p => globalThis.FF?.content?.scan(p), [payload]);
  let best = null;
  for (const r of results) {
    const s = r.result;
    if (!s || !s.fields) continue;
    const rank = s.fields + (s.focused ? 1000 : 0);
    if (!best || rank > best.rank) best = { frameId: r.frameId, fields: s.fields, rank };
  }
  return best;
}

function badge(tabId, count) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: count ? '#16a34a' : '#d97706' });
  chrome.action.setBadgeText({ tabId, text: String(count) });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 4000);
}

// ── Filling ──────────────────────────────────────────────────────────────────

async function payloadFor(mode, profileId) {
  const s = await FF.store.load();
  if (mode === 'fake') return FF.store.buildFakePayload(s, FF.fake.profile());
  const profile = s.profiles.find(p => p.id === (profileId || s.activeProfileId)) || s.profiles[0];
  return FF.store.buildPayload(s, profile);
}

/** mode: 'profile' | 'fake'. frameId: fill that frame (context menu) instead of the best one. */
async function fillTab(tabId, { mode = 'profile', profileId, frameId } = {}) {
  const payload = await payloadFor(mode, profileId);
  if (frameId === undefined) {
    frameId = (await bestFrame(tabId, payload))?.frameId;
  } else {
    await inject(tabId, [frameId]);
  }
  const empty = { filled: [], missed: [], values: {}, noForm: true };
  if (frameId === undefined) {
    badge(tabId, 0);
    return empty;
  }
  const [r] = await run(tabId, [frameId], p => globalThis.FF.content.fill(p), [payload]);
  const result = { ...empty, ...r?.result, noForm: false, mode, passwordLocked: payload.passwordLocked };
  badge(tabId, result.filled.length);
  return result;
}

async function scanTab(tabId) {
  const s = await FF.store.load();
  const best = await bestFrame(tabId, { custom: s.customFields.map(cf => ({ ...cf, value: '1' })), mappings: {} });
  return { fields: best?.fields || 0 };
}

// ── Per-site auto-fill ───────────────────────────────────────────────────────

/** Registers autofill.js only for allowed origins the user granted access to. */
async function syncAutofill() {
  const { siteRules = {} } = await chrome.storage.local.get('siteRules');
  const matches = [];
  for (const [origin, rule] of Object.entries(siteRules)) {
    if (!rule.autoFill) continue;
    const pattern = `${origin}/*`;
    if (await chrome.permissions.contains({ origins: [pattern] })) matches.push(pattern);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [AUTOFILL_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [AUTOFILL_SCRIPT_ID] });
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: AUTOFILL_SCRIPT_ID,
    matches,
    js: [...CONTENT_FILES, 'autofill.js'],
    runAt: 'document_idle',
    allFrames: true,
  }]);
}

// ── Field mapping (context menu) ─────────────────────────────────────────────

async function mapField(tabId, frameId, pageUrl, key) {
  await inject(tabId, [frameId]);
  const [r] = await run(tabId, [frameId], () => globalThis.FF.content.focusedSelector());
  const selector = r?.result;
  if (!selector) return;
  const origin = new URL(pageUrl).origin;
  const { siteRules = {} } = await chrome.storage.local.get('siteRules');
  const rule = siteRules[origin] || { autoFill: false, mappings: {} };
  rule.mappings = { ...rule.mappings };
  if (key) rule.mappings[selector] = key;
  else delete rule.mappings[selector];
  if (!rule.autoFill && !Object.keys(rule.mappings).length) delete siteRules[origin];
  else siteRules[origin] = rule;
  await chrome.storage.local.set({ siteRules });
}

// ── Context menus ────────────────────────────────────────────────────────────

let menuChain = Promise.resolve();
function rebuildMenus() {
  menuChain = menuChain.then(buildMenus).catch(e => console.error('menus', e));
  return menuChain;
}

async function buildMenus() {
  await chrome.contextMenus.removeAll();
  const s = await FF.store.load();
  const add = props => chrome.contextMenus.create(props);
  const ctx = ['page', 'editable', 'frame'];

  add({ id: 'ff-root', title: 'Fifi-Filler', contexts: ctx });
  add({ id: 'ff-fill', parentId: 'ff-root', title: t('menuFill'), contexts: ctx });
  add({ id: 'ff-fill-fake', parentId: 'ff-root', title: t('menuFillFake'), contexts: ctx });
  if (s.profiles.length > 1) {
    add({ id: 'ff-profiles', parentId: 'ff-root', title: t('menuFillWith'), contexts: ctx });
    for (const p of s.profiles) add({ id: `ff-profile:${p.id}`, parentId: 'ff-profiles', title: p.name, contexts: ctx });
  }
  add({ id: 'ff-sep', parentId: 'ff-root', type: 'separator', contexts: ['editable'] });
  add({ id: 'ff-map', parentId: 'ff-root', title: t('menuMapAs'), contexts: ['editable'] });
  const keys = ['fullName', ...FF.fields.PROFILE_KEYS];
  for (const key of keys) add({ id: `ff-map:${key}`, parentId: 'ff-map', title: t(`f_${key}`), contexts: ['editable'] });
  for (const cf of s.customFields) add({ id: `ff-map:${cf.id}`, parentId: 'ff-map', title: cf.label, contexts: ['editable'] });
  add({ id: 'ff-unmap', parentId: 'ff-root', title: t('menuUnmap'), contexts: ['editable'] });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const id = String(info.menuItemId);
  const frameId = info.frameId ?? 0;
  const pageUrl = info.frameUrl || info.pageUrl;
  if (id === 'ff-fill') fillTab(tab.id, { frameId });
  else if (id === 'ff-fill-fake') fillTab(tab.id, { frameId, mode: 'fake' });
  else if (id.startsWith('ff-profile:')) fillTab(tab.id, { frameId, profileId: id.slice(11) });
  else if (id.startsWith('ff-map:')) mapField(tab.id, frameId, pageUrl, id.slice(7));
  else if (id === 'ff-unmap') mapField(tab.id, frameId, pageUrl, null);
});

// ── Events ───────────────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-form') return;
  const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id) fillTab(target.id).catch(e => console.warn('fill', e));
});

chrome.runtime.onInstalled.addListener(async () => {
  await FF.store.migrate();
  await rebuildMenus();
  await syncAutofill();
});

chrome.runtime.onStartup.addListener(() => syncAutofill());
chrome.permissions.onRemoved.addListener(() => syncAutofill());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.siteRules) syncAutofill();
  if (changes.profiles || changes.customFields) rebuildMenus();
});

const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fromExtension = sender.url?.startsWith(EXTENSION_ORIGIN);
  let job = null;

  if (msg?.type === 'autofill-payload' && sender.tab && sender.origin) {
    // Trust the browser-reported origin, never one sent by the page.
    job = chrome.storage.local.get('siteRules').then(({ siteRules = {} }) =>
      siteRules[sender.origin]?.autoFill ? payloadFor('profile') : null);
  } else if (fromExtension && msg?.type === 'fill') {
    job = fillTab(msg.tabId, { mode: msg.mode, profileId: msg.profileId });
  } else if (fromExtension && msg?.type === 'scan') {
    job = scanTab(msg.tabId);
  }

  if (!job) return false;
  job.then(sendResponse, e => sendResponse({ error: String(e?.message || e) }));
  return true;
});
