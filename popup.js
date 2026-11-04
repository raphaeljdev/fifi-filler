// popup.js — popup UI. Also runs as a full page (popup.html?page=1) for
// file import, since file pickers close extension popups.
(async function () {
  'use strict';
  const { br, fields, fake, store } = FF;
  const IS_PAGE = new URLSearchParams(location.search).has('page');
  const PROFILE_COLORS = ['#c0129f', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  const SECTIONS = [
    { id: 'personal', icon: 'user' },
    { id: 'address', icon: 'pin' },
    { id: 'student', icon: 'cap' },
    { id: 'custom', icon: 'plus' },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

  let S = await store.load();      // storage state
  let vaultKey = await store.getSessionKey();
  let tab = null;                  // current browser tab (null in page mode or on chrome:// pages)
  let origin = null;

  // ── Small helpers ──────────────────────────────────────────────────────────

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c) node.append(c);
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function iconButton(name, title, onclick, cls = '') {
    return el('button', { type: 'button', class: `icon-btn ${cls}`, title, 'aria-label': title, onclick }, icon(name));
  }

  let toastTimer;
  function toast(msg, kind = '') {
    const node = $('#toast');
    node.textContent = msg;
    node.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 2400);
  }

  function applyI18n() {
    document.documentElement.lang = chrome.i18n.getUILanguage();
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
    for (const n of document.querySelectorAll('[data-i18n-title]')) {
      n.title = t(n.dataset.i18nTitle);
      n.setAttribute('aria-label', n.title);
    }
  }

  function activeProfile() {
    return S.profiles.find(p => p.id === S.activeProfileId) || S.profiles[0];
  }

  function fieldLabel(key) {
    return S.customFields.find(cf => cf.id === key)?.label || t(`f_${key}`);
  }

  async function withLoading(btn, fn) {
    btn.classList.add('loading');
    try {
      return await fn();
    } finally {
      btn.classList.remove('loading');
    }
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  /**
   * Opens a dialog. fields: [{name, label, type, value}], actions: [{id, label, kind}].
   * validate(values) may return an error string to keep the dialog open.
   * Resolves {action, values} or null when cancelled.
   */
  function modal({ title, text = '', fieldsDef = [], actions, stack = false, validate }) {
    const dlg = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalText').textContent = text;
    const err = $('#modalError');
    err.hidden = true;
    const box = $('#modalFields');
    box.replaceChildren(...fieldsDef.map(f => el('label', {},
      f.label || '',
      el('input', { name: f.name, type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', autocomplete: 'off', required: f.required }),
    )));
    const acts = $('#modalActions');
    acts.className = `modal-actions${stack ? ' stack' : ''}`;
    const all = actions || [{ id: 'cancel', label: t('cancel'), kind: 'ghost' }, { id: 'ok', label: t('ok'), kind: 'primary' }];
    acts.replaceChildren(...all.map(a => el('button', { class: `btn btn-sm btn-${a.kind || 'ghost'}`, value: a.id, type: 'submit' }, a.icon && icon(a.icon), a.label)));

    return new Promise(resolve => {
      const form = $('#modalForm');
      const onSubmit = async e => {
        const action = e.submitter?.value || 'ok';
        const values = Object.fromEntries([...box.querySelectorAll('input')].map(i => [i.name, i.value]));
        if (action !== 'cancel' && validate) {
          e.preventDefault();
          const msg = await validate(values, action);
          if (msg) {
            err.textContent = msg;
            err.hidden = false;
            return;
          }
          dlg.close();
        }
        cleanup();
        resolve(action === 'cancel' ? null : { action, values });
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('cancel', onCancel);
      }
      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      (box.querySelector('input') || acts.lastElementChild)?.focus();
    });
  }

  async function confirmModal(title, text, okLabel = t('ok'), kind = 'primary') {
    const r = await modal({ title, text, actions: [{ id: 'cancel', label: t('cancel') }, { id: 'ok', label: okLabel, kind }] });
    return Boolean(r);
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  function selectTab(name) {
    for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `tab-${name}`;
  }

  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => selectTab(b.dataset.tab));

  // ── Header: profiles & vault ───────────────────────────────────────────────

  function renderHeader() {
    const sel = $('#profileSelect');
    sel.replaceChildren(...S.profiles.map(p => el('option', { value: p.id, text: p.name })));
    sel.value = S.activeProfileId;
    const idx = S.profiles.findIndex(p => p.id === S.activeProfileId);
    $('#profileDot').style.background = PROFILE_COLORS[idx % PROFILE_COLORS.length];

    const lockBtn = $('#lockBtn');
    lockBtn.hidden = !S.vault;
    lockBtn.classList.toggle('unlocked', Boolean(vaultKey));
    lockBtn.querySelector('use').setAttribute('href', vaultKey ? '#i-unlock' : '#i-lock');
    lockBtn.title = t(vaultKey ? 'vaultLockNow' : 'vaultUnlock');
    lockBtn.setAttribute('aria-label', lockBtn.title);

    $('#legacyBanner').hidden = !Object.keys(S.legacyPasswords).length;
  }

  $('#profileSelect').addEventListener('change', async e => {
    await flushSave();
    S.activeProfileId = e.target.value;
    await store.set({ activeProfileId: S.activeProfileId });
    renderHeader();
    renderProfileForm();
    toast(t('profileLoaded', [activeProfile().name]));
  });

  $('#profileMenuBtn').addEventListener('click', async () => {
    const p = activeProfile();
    const r = await modal({
      title: p.name,
      stack: true,
      actions: [
        { id: 'new', label: t('profileNew'), icon: 'plus' },
        { id: 'rename', label: t('profileRename'), icon: 'user' },
        { id: 'duplicate', label: t('profileDuplicate'), icon: 'copy' },
        ...(S.profiles.length > 1 ? [{ id: 'delete', label: t('profileDelete'), icon: 'trash', kind: 'danger' }] : []),
        { id: 'cancel', label: t('cancel') },
      ],
    });
    if (!r) return;
    await flushSave();
    if (r.action === 'new' || r.action === 'duplicate') {
      const base = r.action === 'duplicate' ? p : null;
      const name = await askName(base ? t('profileCopyName', [p.name]) : t('profileDefaultName', [String(S.profiles.length + 1)]));
      if (!name) return;
      const np = store.newProfile(name, base?.data);
      if (base) {
        np.custom = { ...base.custom };
        np.secret = base.secret;
      }
      S.profiles.push(np);
      S.activeProfileId = np.id;
    } else if (r.action === 'rename') {
      const name = await askName(p.name);
      if (!name) return;
      p.name = name;
    } else if (r.action === 'delete') {
      if (!await confirmModal(t('profileDelete'), t('profileDeleteConfirm', [p.name]), t('delete'), 'danger')) return;
      S.profiles = S.profiles.filter(x => x.id !== p.id);
      S.activeProfileId = S.profiles[0].id;
    }
    await store.set({ profiles: S.profiles, activeProfileId: S.activeProfileId });
    renderHeader();
    renderProfileForm();
  });

  async function askName(value) {
    const r = await modal({
      title: t('profileName'),
      fieldsDef: [{ name: 'name', value, required: true }],
      validate: v => (v.name.trim() ? null : t('required')),
    });
    return r?.values.name.trim().slice(0, 30) || null;
  }

  $('#lockBtn').addEventListener('click', async () => {
    if (vaultKey) {
      await store.lock();
      vaultKey = null;
      toast(t('vaultLocked'));
      refreshVaultUI();
    } else {
      await unlockFlow();
    }
  });

  // ── Vault flows ────────────────────────────────────────────────────────────

  async function unlockFlow() {
    const r = await modal({
      title: t('vaultUnlock'),
      fieldsDef: [{ name: 'master', type: 'password', label: t('vaultMaster') }],
      validate: async v => {
        vaultKey = await store.unlock(v.master);
        return vaultKey ? null : t('vaultWrong');
      },
    });
    if (!r) return false;
    toast(t('vaultUnlocked'));
    refreshVaultUI();
    return true;
  }

  async function createVaultFlow() {
    await flushSave();
    const r = await modal({
      title: t('vaultCreate'),
      text: t('vaultCreateText'),
      fieldsDef: [
        { name: 'a', type: 'password', label: t('vaultMaster') },
        { name: 'b', type: 'password', label: t('vaultConfirm') },
      ],
      validate: v => (v.a.length < 6 ? t('vaultTooShort') : v.a !== v.b ? t('vaultMismatch') : null),
    });
    if (!r) return;
    vaultKey = await store.createVault(r.values.a);
    S = await store.load();
    toast(t('vaultCreated'));
    refreshVaultUI();
  }

  async function changeMasterFlow() {
    const r = await modal({
      title: t('vaultChange'),
      fieldsDef: [
        { name: 'a', type: 'password', label: t('vaultNewMaster') },
        { name: 'b', type: 'password', label: t('vaultConfirm') },
      ],
      validate: v => (v.a.length < 6 ? t('vaultTooShort') : v.a !== v.b ? t('vaultMismatch') : null),
    });
    if (!r) return;
    await flushSave();
    await store.changeMaster(r.values.a);
    vaultKey = await store.getSessionKey();
    S = await store.load();
    toast(t('vaultChanged'));
    refreshVaultUI();
  }

  async function removeVaultFlow() {
    await flushSave();
    if (!await confirmModal(t('vaultRemove'), t('vaultRemoveConfirm'), t('delete'), 'danger')) return;
    await store.removeVault();
    vaultKey = null;
    S = await store.load();
    toast(t('vaultRemoved'));
    refreshVaultUI();
  }

  function refreshVaultUI() {
    renderHeader();
    renderVaultCard();
    renderProfileForm();
  }

  $('#legacyCreateVault').addEventListener('click', createVaultFlow);
  $('#legacyDiscard').addEventListener('click', async () => {
    if (!await confirmModal(t('legacyDiscard'), t('legacyDiscardConfirm'), t('delete'), 'danger')) return;
    S.legacyPasswords = {};
    await store.set({ legacyPasswords: {} });
    renderHeader();
  });

  // ── Profile form ───────────────────────────────────────────────────────────

  const MASKS = {
    cpf: br.formatCPF,
    date: br.formatDate,
    cep: br.formatCEP,
    phone: br.formatPhone,
    uf: v => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
  };
  const VALIDATORS = {
    cpf: v => br.isValidCPF(v) || t('errCpf'),
    date: v => Boolean(br.parseDate(v)) || t('errDate'),
    cep: v => br.isValidCEP(v) || t('errCep'),
    phone: v => br.isValidPhone(v) || t('errPhone'),
    email: v => br.isValidEmail(v) || t('errEmail'),
    uf: v => Boolean(br.findState(v)) || t('errUf'),
  };

  function validateField(wrap, mask, value) {
    const check = VALIDATORS[mask];
    const res = value && check ? check(value) : true;
    wrap.classList.toggle('invalid', res !== true);
    const errNode = wrap.querySelector('.field-error');
    errNode.textContent = res === true ? '' : res;
    errNode.hidden = res === true;
  }

  function passwordControls(p) {
    if (!S.vault) {
      return { disabled: true, note: [t('pwNeedsVault'), ' ', el('button', { type: 'button', text: t('vaultCreate'), onclick: createVaultFlow })] };
    }
    if (!vaultKey) {
      return { disabled: true, note: [t(p.secret ? 'pwLocked' : 'pwLockedEmpty'), ' ', el('button', { type: 'button', text: t('vaultUnlock'), onclick: unlockFlow })] };
    }
    return { disabled: false };
  }

  function buildField(def, value, p) {
    const id = `pf-${def.key}`;
    const input = el('input', {
      id, name: def.key,
      type: def.secret ? 'password' : (def.type === 'email' ? 'email' : 'text'),
      inputmode: ['cpf', 'date', 'cep', 'phone'].includes(def.mask) ? 'numeric' : undefined,
      placeholder: def.placeholder || '',
      autocomplete: def.secret ? 'new-password' : 'off',
      spellcheck: 'false',
    });
    input.value = value || '';
    const wrap = el('div', { class: `field${def.half ? ' half' : ''}` },
      el('label', { for: id, text: fieldLabel(def.key) }),
      el('div', { class: 'input-wrap' }, input),
      el('span', { class: 'field-error', hidden: true }),
    );
    const inputWrap = wrap.querySelector('.input-wrap');

    if (def.mask) {
      input.addEventListener('input', () => {
        const fmt = MASKS[def.mask];
        if (fmt) {
          const atEnd = input.selectionStart === input.value.length;
          input.value = fmt(input.value);
          if (atEnd) input.selectionStart = input.selectionEnd = input.value.length;
        }
        if (wrap.classList.contains('invalid')) validateField(wrap, def.mask, input.value);
      });
      input.addEventListener('blur', () => validateField(wrap, def.mask, input.value));
      if (value) validateField(wrap, def.mask, value);
    }

    if (def.key === 'zip') {
      const btn = iconButton('search', t('cepLookup'), () => lookupCep(btn));
      inputWrap.append(btn);
      input.addEventListener('input', () => {
        if (br.digits(input.value).length === 8 && !$('#pf-street').value) lookupCep(btn, true);
      });
    }

    if (def.secret) {
      const ctl = passwordControls(p);
      input.disabled = ctl.disabled;
      input.placeholder = ctl.disabled ? '••••••••' : '';
      if (!ctl.disabled) {
        const eye = iconButton('eye', t('pwToggle'), () => {
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          eye.querySelector('use').setAttribute('href', show ? '#i-eyeoff' : '#i-eye');
        });
        const gen = iconButton('dice', t('pwGenerate'), () => {
          input.value = fake.password();
          input.type = 'text';
          eye.querySelector('use').setAttribute('href', '#i-eyeoff');
          scheduleSave();
        });
        inputWrap.append(eye, gen);
      } else {
        wrap.append(el('span', { class: 'field-note' }, ...ctl.note));
      }
    }
    return wrap;
  }

  async function renderProfileForm() {
    const form = $('#profileForm');
    const p = activeProfile();
    const password = await store.readSecret(p, vaultKey);
    const openState = Object.fromEntries([...form.querySelectorAll('details')].map(d => [d.dataset.section, d.open]));

    const groups = SECTIONS.map(sec => {
      let body;
      if (sec.id === 'custom') {
        body = S.customFields.length
          ? S.customFields.map(cf => buildField({ key: cf.id }, p.custom?.[cf.id], p))
          : [el('p', { class: 'field muted', text: t('customEmpty') })];
      } else {
        body = fields.PROFILE_FIELDS
          .filter(f => f.section === sec.id)
          .map(f => buildField(f, f.secret ? password : p.data[f.key], p));
      }
      const open = openState[sec.id] ?? sec.id !== 'student';
      return el('details', { class: 'group', 'data-section': sec.id, open },
        el('summary', {}, icon(sec.icon), t(`sec_${sec.id}`)),
        el('div', { class: 'group-body' }, body));
    });
    form.replaceChildren(...groups);
  }

  // Autosave: debounced, password sealed with the vault key.
  let saveTimer = null;
  let savePending = null;

  function scheduleSave() {
    $('#saveState').textContent = '';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { savePending = saveProfile(); }, 350);
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      savePending = saveProfile();
    }
    await savePending;
  }

  async function saveProfile() {
    saveTimer = null;
    const form = $('#profileForm');
    const p = activeProfile();
    const data = {};
    for (const f of fields.PROFILE_FIELDS) {
      const input = form.elements[f.key];
      if (!input || f.secret) continue;
      const v = input.value.trim();
      if (v) data[f.key] = v;
    }
    p.data = data;
    p.custom = {};
    for (const cf of S.customFields) {
      const v = form.elements[cf.id]?.value.trim();
      if (v) p.custom[cf.id] = v;
    }
    const pw = form.elements.password;
    if (pw && !pw.disabled && vaultKey) p.secret = await store.sealSecret(pw.value, vaultKey);
    await store.set({ profiles: S.profiles });
    $('#saveState').textContent = '✓';
  }

  $('#profileForm').addEventListener('input', scheduleSave);
  window.addEventListener('pagehide', () => { if (saveTimer) saveProfile(); });

  async function lookupCep(btn, silent = false) {
    const cep = br.digits($('#pf-zip').value);
    if (cep.length !== 8) {
      if (!silent) toast(t('errCep'), 'error');
      return;
    }
    await withLoading(btn, async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await res.json();
        if (!res.ok || d.erro) throw new Error('not found');
        const set = (key, v) => { if (v) $(`#pf-${key}`).value = v; };
        set('street', d.logradouro);
        set('neighborhood', d.bairro);
        set('city', d.localidade);
        set('state', d.uf);
        if (d.complemento && !$('#pf-complement').value) set('complement', d.complemento);
        scheduleSave();
        toast(t('cepFound'));
        $('#pf-number').focus();
      } catch {
        if (!silent) toast(t('cepNotFound'), 'error');
      }
    });
  }

  $('#fakeProfileBtn').addEventListener('click', async () => {
    const hasData = Object.keys(activeProfile().data).length > 0;
    if (hasData && !await confirmModal(t('fakeProfile'), t('fakeProfileConfirm'), t('replace'), 'danger')) return;
    const f = fake.profile();
    const form = $('#profileForm');
    for (const def of fields.PROFILE_FIELDS) {
      const input = form.elements[def.key];
      if (input && !input.disabled) input.value = f[def.key] || '';
    }
    for (const n of form.querySelectorAll('.field.invalid')) n.classList.remove('invalid');
    scheduleSave();
    toast(t('fakeProfileDone'));
  });

  $('#clearProfileBtn').addEventListener('click', async () => {
    if (!await confirmModal(t('clearProfile'), t('clearProfileConfirm', [activeProfile().name]), t('clear'), 'danger')) return;
    for (const input of $('#profileForm').querySelectorAll('input:not(:disabled)')) input.value = '';
    await saveProfile();
    renderProfileForm();
    toast(t('cleared'));
  });

  // ── Fill tab ───────────────────────────────────────────────────────────────

  function setStatus(kind, text) {
    $('#statusDot').className = `dot ${kind}`;
    $('#statusText').textContent = text;
  }

  async function initFillTab() {
    if (IS_PAGE) {
      $('#siteHost').textContent = t('pageModeHost');
      setStatus('', t('pageModeStatus'));
      disableFill();
      return;
    }
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (!/^https?:/.test(url)) {
      $('#siteHost').textContent = url ? new URL(url).protocol.replace(':', '') : '—';
      setStatus('warn', t('statusUnsupported'));
      disableFill();
      return;
    }
    origin = new URL(url).origin;
    $('#siteHost').textContent = new URL(url).host;
    $('#autoFillSite').checked = Boolean(S.siteRules[origin]?.autoFill);

    const res = await chrome.runtime.sendMessage({ type: 'scan', tabId: tab.id }).catch(e => ({ error: String(e) }));
    if (res?.error) setStatus('warn', t('statusNoAccess'));
    else if (res?.fields > 0) setStatus('ok', t('statusFields', [String(res.fields)]));
    else setStatus('warn', t('statusNoForm'));
  }

  function disableFill() {
    $('#fillBtn').disabled = true;
    $('#fakeFillBtn').disabled = true;
    $('#autoFillSite').disabled = true;
  }

  async function runFill(mode, btn) {
    await flushSave();
    const res = await withLoading(btn, () =>
      chrome.runtime.sendMessage({ type: 'fill', tabId: tab.id, mode }).catch(e => ({ error: String(e) })));
    showResult(res, mode);
  }

  function showResult(res, mode) {
    const box = $('#result');
    box.hidden = false;
    const filled = res?.filled || [];
    const missed = res?.missed || [];
    $('#resultTitle').textContent = res?.error ? t('fillError')
      : res.noForm ? t('fillNoForm')
        : filled.length ? t('fillDone', [String(filled.length)]) : t('fillNone');

    const note = $('#resultNote');
    note.hidden = !res?.passwordLocked && !res?.error;
    note.textContent = res?.error ? res.error : t('pwSkippedLocked');

    $('#resultFilled').replaceChildren(...filled.map(k => el('span', { class: 'chip' }, icon('check'), fieldLabel(k))));
    $('#resultMissed').replaceChildren(...(missed.length ? [el('span', { class: 'row-sub', text: t('notFound') })] : []),
      ...missed.map(k => el('span', { class: 'chip', text: fieldLabel(k) })));

    const dl = $('#resultValues');
    dl.hidden = mode !== 'fake' || !res?.values || !Object.keys(res.values).length;
    if (!dl.hidden) {
      dl.replaceChildren(...Object.entries(res.values).flatMap(([k, v]) => [
        el('dt', { text: fieldLabel(k) }),
        el('dd', { text: v, title: v }),
        iconButton('copy', t('copy'), async () => {
          await navigator.clipboard.writeText(v);
          toast(t('copied'));
        }),
      ]));
    }
  }

  $('#fillBtn').addEventListener('click', e => runFill('profile', e.currentTarget));
  $('#fakeFillBtn').addEventListener('click', e => runFill('fake', e.currentTarget));
  $('#resultClose').addEventListener('click', () => { $('#result').hidden = true; });

  $('#autoFillSite').addEventListener('change', async e => {
    const on = e.target.checked;
    const pattern = `${origin}/*`;
    if (on) {
      // Must run inside the click: Chrome only shows the permission prompt for user gestures.
      const granted = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
      if (!granted) {
        e.target.checked = false;
        toast(t('permDenied'), 'error');
        return;
      }
    }
    await setSiteRule(origin, { autoFill: on });
    if (!on) await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
    toast(t(on ? 'autoFillOn' : 'autoFillOff'));
  });

  async function setSiteRule(o, patch) {
    const { siteRules = {} } = await chrome.storage.local.get('siteRules');
    const rule = { autoFill: false, mappings: {}, ...siteRules[o], ...patch };
    if (!rule.autoFill && !Object.keys(rule.mappings).length) delete siteRules[o];
    else siteRules[o] = rule;
    await store.set({ siteRules });
    S.siteRules = siteRules;
    renderSites();
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function renderVaultCard() {
    const status = $('#vaultStatus');
    const actions = $('#vaultActions');
    const btn = (label, kind, onclick, ic) => el('button', { type: 'button', class: `btn btn-sm btn-${kind}`, onclick }, ic && icon(ic), label);
    if (!S.vault) {
      status.textContent = t('vaultNone');
      actions.replaceChildren(btn(t('vaultCreate'), 'primary', createVaultFlow, 'shield'));
    } else if (!vaultKey) {
      status.textContent = t('vaultIsLocked');
      actions.replaceChildren(btn(t('vaultUnlock'), 'primary', unlockFlow, 'unlock'), btn(t('vaultRemove'), 'danger', removeVaultFlow));
    } else {
      status.textContent = t('vaultIsUnlocked');
      actions.replaceChildren(
        btn(t('vaultLockNow'), 'ghost', async () => {
          await store.lock();
          vaultKey = null;
          refreshVaultUI();
        }, 'lock'),
        btn(t('vaultChange'), 'ghost', changeMasterFlow),
        btn(t('vaultRemove'), 'danger', removeVaultFlow),
      );
    }
  }

  $('#highlightToggle').addEventListener('change', async e => {
    S.settings.highlight = e.target.checked;
    await store.set({ settings: S.settings });
  });

  async function renderShortcut() {
    const cmd = (await chrome.commands.getAll()).find(c => c.name === 'fill-form');
    const sc = cmd?.shortcut || '';
    $('#shortcutText').textContent = sc || t('shortcutNone');
    $('#shortcutKbd').hidden = !sc;
    $('#shortcutKbd').textContent = sc;
  }
  $('#shortcutBtn').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  function renderCustomFields() {
    const list = $('#customList');
    if (!S.customFields.length) {
      list.replaceChildren(el('div', { class: 'empty', text: t('customEmpty') }));
      return;
    }
    list.replaceChildren(...S.customFields.map(cf => el('div', { class: 'row' },
      el('span', { class: 'row-text' },
        el('span', { class: 'row-title', text: cf.label }),
        el('span', { class: 'row-sub', text: cf.patterns || cf.label })),
      iconButton('trash', t('delete'), async () => {
        if (!await confirmModal(t('delete'), t('customDeleteConfirm', [cf.label]), t('delete'), 'danger')) return;
        await flushSave();
        S.customFields = S.customFields.filter(x => x.id !== cf.id);
        for (const p of S.profiles) delete p.custom?.[cf.id];
        await store.set({ customFields: S.customFields, profiles: S.profiles });
        renderCustomFields();
        renderProfileForm();
      }),
    )));
  }

  $('#customForm').addEventListener('submit', async e => {
    e.preventDefault();
    const label = $('#customLabel').value.trim();
    if (!label) return;
    await flushSave();
    S.customFields.push({ id: store.newId('cf'), label, patterns: $('#customPatterns').value.trim() || label });
    await store.set({ customFields: S.customFields });
    $('#customLabel').value = '';
    $('#customPatterns').value = '';
    renderCustomFields();
    renderProfileForm();
    toast(t('customAdded'));
  });

  function renderSites() {
    const list = $('#sitesList');
    const entries = Object.entries(S.siteRules);
    if (!entries.length) {
      list.replaceChildren(el('div', { class: 'empty', text: t('sitesEmpty') }));
      return;
    }
    list.replaceChildren(...entries.map(([o, rule]) => {
      const maps = Object.keys(rule.mappings || {}).length;
      return el('div', { class: 'row' },
        el('span', { class: 'row-text' },
          el('span', { class: 'row-title', text: new URL(o).host }),
          el('span', { class: 'row-sub' },
            rule.autoFill ? el('span', { class: 'tag', text: t('tagAuto') }) : null,
            maps ? ` ${t('mappingsCount', [String(maps)])}` : '')),
        iconButton('trash', t('siteForget'), async () => {
          const { siteRules = {} } = await chrome.storage.local.get('siteRules');
          delete siteRules[o];
          await store.set({ siteRules });
          await chrome.permissions.remove({ origins: [`${o}/*`] }).catch(() => {});
          S.siteRules = siteRules;
          if (o === origin) $('#autoFillSite').checked = false;
          renderSites();
        }));
    }));
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async function exportBackup() {
    await flushSave();
    const r = await modal({
      title: t('export'),
      text: t(S.vault && !vaultKey ? 'exportTextLocked' : 'exportText'),
      fieldsDef: [
        { name: 'a', type: 'password', label: t('backupPass') },
        { name: 'b', type: 'password', label: t('vaultConfirm') },
      ],
      validate: v => (v.a.length < 6 ? t('vaultTooShort') : v.a !== v.b ? t('vaultMismatch') : null),
    });
    if (!r) return;
    const profiles = [];
    for (const p of S.profiles) {
      profiles.push({ name: p.name, data: p.data, custom: p.custom, password: await store.readSecret(p, vaultKey) || undefined });
    }
    const siteRules = Object.fromEntries(Object.entries(S.siteRules)
      .filter(([, rule]) => Object.keys(rule.mappings || {}).length)
      .map(([o, rule]) => [o, { mappings: rule.mappings }]));
    const plain = JSON.stringify({ profiles, customFields: S.customFields, siteRules });
    const salt = FF.crypto.randomB64(16);
    const key = await FF.crypto.deriveKey(r.values.a, salt);
    const file = { format: 'fifi-filler-backup', version: 1, kdf: { salt, iterations: FF.crypto.ITERATIONS }, box: await FF.crypto.encrypt(key, plain) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: `fifi-filler-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(t('exported'));
  }

  async function importBackup(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
      if (parsed.format !== 'fifi-filler-backup') throw new Error();
    } catch {
      toast(t('importInvalid'), 'error');
      return;
    }
    let data = null;
    const r = await modal({
      title: t('import'),
      fieldsDef: [{ name: 'pass', type: 'password', label: t('backupPass') }],
      validate: async v => {
        try {
          const key = await FF.crypto.deriveKey(v.pass, parsed.kdf.salt, parsed.kdf.iterations);
          data = JSON.parse(await FF.crypto.decrypt(key, parsed.box));
          return null;
        } catch {
          return t('vaultWrong');
        }
      },
    });
    if (!r || !data) return;

    await flushSave();
    let skippedPasswords = 0;
    const names = new Set(S.profiles.map(p => p.name));
    const idMap = {};
    for (const cf of data.customFields || []) {
      const existing = S.customFields.find(x => x.label === cf.label);
      if (existing) {
        idMap[cf.id] = existing.id;
      } else {
        const id = store.newId('cf');
        idMap[cf.id] = id;
        S.customFields.push({ id, label: String(cf.label).slice(0, 40), patterns: String(cf.patterns || '').slice(0, 200) });
      }
    }
    for (const ip of data.profiles || []) {
      let name = String(ip.name || t('profileName')).slice(0, 30);
      if (names.has(name)) name = t('profileImportedName', [name]).slice(0, 30);
      names.add(name);
      const np = store.newProfile(name, sanitizeData(ip.data));
      for (const [k, v] of Object.entries(ip.custom || {})) if (idMap[k]) np.custom[idMap[k]] = String(v);
      if (ip.password) {
        if (vaultKey) np.secret = await store.sealSecret(String(ip.password), vaultKey);
        else skippedPasswords++;
      }
      S.profiles.push(np);
    }
    for (const [o, rule] of Object.entries(data.siteRules || {})) {
      if (!/^https?:\/\/[^/]+$/.test(o)) continue;
      const cur = S.siteRules[o] || { autoFill: false, mappings: {} };
      S.siteRules[o] = { ...cur, mappings: { ...rule.mappings, ...cur.mappings } };
    }
    await store.set({ profiles: S.profiles, customFields: S.customFields, siteRules: S.siteRules });
    renderAll();
    toast(skippedPasswords ? t('importedNoPw', [String(skippedPasswords)]) : t('imported'));
  }

  function sanitizeData(d) {
    const out = {};
    for (const k of fields.PROFILE_KEYS) if (typeof d?.[k] === 'string' && k !== 'password') out[k] = d[k].slice(0, 200);
    return out;
  }

  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importBtn').addEventListener('click', () => {
    if (IS_PAGE) $('#importFile').click();
    else chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?page=1#settings') });
  });
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) importBackup(f);
    e.target.value = '';
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  function renderAll() {
    renderHeader();
    renderProfileForm();
    renderVaultCard();
    renderCustomFields();
    renderSites();
    $('#highlightToggle').checked = S.settings.highlight;
  }

  // Keep in sync with changes made elsewhere (background mappings, another popup/page).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.siteRules) {
      S.siteRules = changes.siteRules.newValue || {};
      renderSites();
    }
  });

  if (IS_PAGE) document.body.classList.add('page');
  applyI18n();
  $('#version').textContent = `v${chrome.runtime.getManifest().version}`;
  renderAll();
  renderShortcut();
  const initial = location.hash.slice(1);
  selectTab(['fill', 'profile', 'settings'].includes(initial) ? initial : 'fill');
  initFillTab();
})();
