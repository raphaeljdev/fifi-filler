// content.js — finds form fields on the page and fills them.
// Injected on demand (popup, shortcut, context menu) together with lib/br.js and
// lib/fields.js; also registered per site for auto-fill (see autofill.js).
// Exposes FF.content = { fill, scan, focusedSelector }. Never reads storage:
// the background sends the values to use.
(function (root) {
  'use strict';
  const FF = root.FF;
  if (FF.content) return; // already injected in this frame

  const { br, fields } = FF;
  const THRESHOLD = 35;
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset', 'file', 'range', 'color', 'search']);
  const GROUP_SELECTOR = 'form, fieldset, [role="form"], dialog, [role="dialog"], section, main';
  const autoFilled = new WeakSet();

  // ── DOM helpers ────────────────────────────────────────────────────────────

  /** All elements in the document, including open shadow roots. */
  function* walk(rootNode) {
    for (const el of rootNode.querySelectorAll('*')) {
      yield el;
      if (el.shadowRoot) yield* walk(el.shadowRoot);
    }
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function isSearchBox(el) {
    const n = (el.name || '').toLowerCase();
    return el.closest('[role="search"]') !== null || n === 'q' || n === 's' || /\bsearch|busca|pesquis/i.test(el.getAttribute('aria-label') || '');
  }

  function isFillable(el) {
    const tag = el.tagName;
    if (tag === 'INPUT') {
      if (SKIP_TYPES.has((el.type || 'text').toLowerCase())) return false;
    } else if (tag !== 'SELECT' && tag !== 'TEXTAREA') {
      return false;
    }
    return !el.disabled && !el.readOnly && isVisible(el) && !isSearchBox(el);
  }

  function collect() {
    return [...walk(document)].filter(isFillable);
  }

  /** closest() that crosses shadow-root boundaries. */
  function composedClosest(el, selector) {
    let node = el;
    while (node) {
      const hit = node.closest?.(selector);
      if (hit) return hit;
      const rootNode = node.getRootNode();
      node = rootNode instanceof ShadowRoot ? rootNode.host : null;
    }
    return null;
  }

  function deepActiveElement() {
    let a = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  // ── Hints ──────────────────────────────────────────────────────────────────

  /** Normalizes a hint: splits camelCase and separators, strips accents. */
  function norm(s) {
    return br.normalize(String(s || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]:/()*#º°]+/g, ' '));
  }

  function textOf(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  }

  /** Describes an element as weighted text sources (name/id strongest, nearby text weakest). */
  function hintsFor(el) {
    const out = [];
    const add = (text, w) => {
      const t = norm(text);
      if (t) out.push({ t, w });
    };
    add(el.name, 1);
    add(el.id, 1);
    for (const l of el.labels || []) add(textOf(l), 0.9);
    add(el.getAttribute('aria-label'), 0.9);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const rootNode = el.getRootNode();
      for (const id of labelledBy.split(/\s+/)) add(textOf(rootNode.getElementById?.(id)), 0.9);
    }
    add(el.placeholder, 0.75);
    for (const a of ['data-testid', 'data-qa', 'data-cy', 'data-field', 'formcontrolname', 'ng-model', 'v-model']) add(el.getAttribute(a), 0.75);
    add(el.title, 0.6);

    if (!el.labels?.length) {
      // Nearest container holding only this field: its label-like text.
      let node = el.parentElement;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        const fieldsInside = node.querySelectorAll('input, select, textarea').length;
        if (fieldsInside > 1) break;
        const lab = node.querySelector('label, legend, [class*="label" i]');
        if (lab && !lab.contains(el)) {
          add(textOf(lab), 0.7);
          break;
        }
      }
      const prev = el.previousElementSibling;
      if (prev && !prev.matches('input, select, textarea')) {
        const t = textOf(prev);
        if (t.length <= 40) add(t, 0.6);
      }
    }
    return out;
  }

  // ── Scoring & assignment ───────────────────────────────────────────────────

  function score(el, rule, hints) {
    const isPwd = el.type === 'password';
    if (Boolean(rule.passwordOnly) !== isPwd) return 0;

    let s = 0;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    if (rule.ac?.some(t => ac.includes(t))) s = 100;

    const compactIds = [el.id, el.name].map(v => br.normalize(v).replace(/[^a-z0-9]/g, '')).filter(Boolean);
    if (rule.ids?.some(id => compactIds.includes(id))) s = Math.max(s, 85);

    for (const h of hints) {
      if (rule.neg?.test(h.t)) continue;
      for (const p of rule.re) {
        if (p.re.test(h.t)) s = Math.max(s, 70 * h.w * p.w);
      }
    }

    const type = (el.type || '').toLowerCase();
    if (rule.key === 'email' && type === 'email') s = Math.max(s, 90);
    if (rule.key === 'phone' && type === 'tel') s = Math.max(s, 50);
    if (type === 'email' && rule.key !== 'email') s = 0;
    if (type === 'date' && !['dateOfBirth', 'validityDate'].includes(rule.key)) s = Math.min(s, 20);
    return s;
  }

  function selectorFor(el) {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    if (el.name) {
      const sel = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  /** Best rule for each element: [{el, key, score}]. */
  function rank(elements, rules, mappings) {
    const mapped = new Map();
    for (const [sel, key] of Object.entries(mappings || {})) {
      try {
        const el = document.querySelector(sel);
        if (el) mapped.set(el, key);
      } catch { /* invalid selector saved earlier */ }
    }
    const out = [];
    for (const el of elements) {
      if (mapped.has(el) && rules.some(r => r.key === mapped.get(el))) {
        out.push({ el, key: mapped.get(el), score: 1000 });
        continue;
      }
      const hints = hintsFor(el);
      let best = null;
      for (const rule of rules) {
        const s = score(el, rule, hints);
        if (s >= THRESHOLD && (!best || s > best.score)) best = { el, key: rule.key, score: s };
      }
      if (best) out.push(best);
    }
    return out;
  }

  /** Greedy: one element per key (unless multi), strongest matches first. */
  function assign(ranked, rules) {
    const multi = new Set(rules.filter(r => r.multi).map(r => r.key));
    const plan = new Map();
    for (const m of [...ranked].sort((a, b) => b.score - a.score)) {
      if (plan.has(m.key) && !multi.has(m.key)) continue;
      if (!plan.has(m.key)) plan.set(m.key, []);
      plan.get(m.key).push(m.el);
    }
    // A plain "Nome" next to a "Sobrenome" field means first name only.
    if (plan.has('fullName') && plan.has('lastName') && !plan.has('firstName')) {
      const el = plan.get('fullName')[0];
      if (!hintsFor(el).some(h => /\b(?:complet|full)/.test(h.t))) {
        plan.set('firstName', [el]);
        plan.delete('fullName');
      }
    }
    return plan;
  }

  function groupOf(el) {
    return el.form || composedClosest(el, GROUP_SELECTOR) || document;
  }

  /** Picks the form to fill: the one holding focus, else the one with most recognized fields. */
  function pickGroup(ranked, minFields) {
    const groups = new Map();
    for (const m of ranked) {
      const g = groupOf(m.el);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(m);
    }
    const active = deepActiveElement();
    let best = null;
    let bestScore = -1;
    for (const members of groups.values()) {
      const keys = new Set(members.map(m => m.key));
      if (keys.size < minFields) continue;
      let s = keys.size + members.filter(m => !m.el.value).length * 0.1;
      if (active && members.some(m => m.el === active)) s += 1000;
      if (s > bestScore) {
        best = members;
        bestScore = s;
      }
    }
    return best;
  }

  // ── Writing values ─────────────────────────────────────────────────────────

  function nativeSet(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function clear(el) {
    el.focus({ preventScroll: true });
    try {
      el.select?.();
    } catch { /* some input types cannot be selected */ }
    if (el.value && !document.execCommand('delete', false)) nativeSet(el, '');
  }

  /** Types like a user (keeps React/Vue state and input masks happy); falls back to the native setter. */
  async function typeInto(el, value, masked) {
    clear(el);
    let ok = true;
    if (masked) {
      // Type digits one by one so the site's own mask formats them.
      const typed = br.digits(value) || value;
      for (const ch of typed) {
        ok = document.execCommand('insertText', false, ch) && ok;
        await new Promise(r => setTimeout(r, 8));
      }
      // No mask on this field: prefer the formatted value when it fits (dates need the slashes).
      if (ok && el.value === typed && typed !== value && (el.maxLength < 0 || el.maxLength >= value.length)) {
        clear(el);
        ok = document.execCommand('insertText', false, value);
      }
    } else {
      ok = document.execCommand('insertText', false, value);
    }
    if (!ok || !el.value) nativeSet(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    return Boolean(el.value);
  }

  function optionCandidates(key, value, v) {
    if (key === 'state') return [v.state, v.stateName];
    if (key === 'birthMonth') {
      const i = Number(value) - 1;
      return [value, br.MONTHS.pt[i], br.MONTHS.en[i], br.MONTHS.pt[i]?.slice(0, 3), br.MONTHS.en[i]?.slice(0, 3)];
    }
    return [value];
  }

  function matchOption(select, candidates) {
    const wanted = candidates.filter(Boolean).map(br.normalize);
    const opts = [...select.options].filter(o => !o.disabled);
    const n = o => [br.normalize(o.value), br.normalize(o.textContent)];
    return opts.find(o => n(o).some(x => wanted.includes(x)))
      || opts.find(o => n(o).some(x => /^\d+$/.test(x) && wanted.some(w => /^\d+$/.test(w) && Number(w) === Number(x))))
      || opts.find(o => wanted.some(w => w.length >= 3 && br.normalize(o.textContent).startsWith(w)));
  }

  /** Dependent selects (city after state) get their options asynchronously: wait a little. */
  async function waitForOption(select, candidates, timeout = 1500) {
    const end = Date.now() + timeout;
    let opt = matchOption(select, candidates);
    while (!opt && Date.now() < end) {
      await new Promise(r => setTimeout(r, 100));
      opt = matchOption(select, candidates);
    }
    return opt;
  }

  /** The value a given element should receive for a key, adapted to the form layout. */
  function valueFor(key, el, v, plan) {
    const type = (el.type || '').toLowerCase();
    switch (key) {
      case 'phone': return plan.has('phoneDdd') ? v.phoneLocal : v.phone;
      case 'street': return plan.has('number') ? v.street : v.addressLine;
      case 'dateOfBirth': return type === 'date' ? v.dateOfBirthISO : v.dateOfBirth;
      case 'validityDate': return type === 'date' ? v.validityDateISO : v.validityDate;
      default: return v[key];
    }
  }

  async function writeValue(el, key, value, rule, v) {
    if (el.tagName === 'SELECT') {
      const opt = await waitForOption(el, optionCandidates(key, value, v));
      if (!opt) return false;
      el.focus({ preventScroll: true });
      nativeSet(el, opt.value);
      return true;
    }
    if (['date', 'month', 'number'].includes(el.type)) {
      nativeSet(el, value);
      return el.value !== '';
    }
    return typeInto(el, value, rule.masked);
  }

  function highlight(el) {
    const prev = { outline: el.style.outline, outlineOffset: el.style.outlineOffset, transition: el.style.transition };
    el.style.transition = 'outline-color .4s';
    el.style.outline = '2px solid #16a34a';
    el.style.outlineOffset = '1px';
    setTimeout(() => Object.assign(el.style, prev), 1800);
  }

  /** A visible disabled field or an option-less select suggests part of the form is still loading. */
  function looksLoading() {
    for (const el of walk(document)) {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || !isVisible(el)) continue;
      if (el.disabled || (el.tagName === 'SELECT' && el.options.length <= 1)) return true;
    }
    return false;
  }

  /** Waits until the DOM stops changing (or max ms). */
  function settle(quiet = 150, max = 1200) {
    return new Promise(resolve => {
      let t;
      const obs = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(done, quiet);
      });
      const hard = setTimeout(done, max);
      function done() {
        obs.disconnect();
        clearTimeout(t);
        clearTimeout(hard);
        resolve();
      }
      obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      t = setTimeout(done, quiet);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function rulesFor(payload) {
    const custom = (payload?.custom || []).map(fields.customRule).filter(Boolean);
    return [...fields.DETECT, ...custom];
  }

  /**
   * Fills the best form in this frame.
   * opts.auto: auto-fill mode — needs ≥2 recognized fields, fills empty fields only, never refills.
   * Returns { filled: [baseKeys], missed: [baseKeys], values: {key: value} }.
   */
  async function fill(payload, opts = {}) {
    const v = fields.expand(payload.values || {});
    for (const cf of payload.custom || []) v[cf.id] = cf.value;

    const allRules = rulesFor(payload);
    const rules = allRules.filter(r => v[r.key]);
    const ruleByKey = new Map(rules.map(r => [r.key, r]));
    const mappings = payload.mappings?.[location.origin];
    const order = [...fields.FILL_ORDER, ...rules.filter(r => r.custom).map(r => r.key)];

    const group = pickGroup(rank(collect(), allRules, mappings), opts.auto ? 2 : 1);
    if (!group) return { filled: [], missed: [], values: {} };
    let plan = assign(group.filter(m => ruleByKey.has(m.key)), rules);

    const filledKeys = new Set();
    const touched = new Set();
    const written = {};

    /** Re-detects fields not yet touched; keeps earlier assignments for keys that vanished. */
    const replan = () => {
      const fresh = pickGroup(rank(collect(), allRules, mappings), 1);
      if (!fresh) return;
      const keep = plan;
      plan = assign(fresh.filter(m => ruleByKey.has(m.key) && !touched.has(m.el)), rules);
      for (const [k, els] of keep) if (!plan.has(k)) plan.set(k, els);
    };

    for (const [i, key] of order.entries()) {
      if (!plan.has(key)) continue;
      const rule = ruleByKey.get(key);
      for (const el of plan.get(key)) {
        if (touched.has(el)) continue;
        touched.add(el);
        if (opts.auto && (el.value || autoFilled.has(el))) continue;
        const value = valueFor(key, el, v, plan);
        if (!value) continue;
        if (await writeValue(el, key, value, rule, v)) {
          filledKeys.add(key);
          written[key] = value;
          if (opts.auto) autoFilled.add(el);
          if (payload.highlight !== false) highlight(el);
        }
      }
      // Selects and the CEP often change the rest of the form: re-detect after them.
      // Fields still missing may be enabled/rendered a bit later (city after state): keep looking briefly.
      if (key === 'zip' || plan.get(key).some(el => el.tagName === 'SELECT')) {
        await settle();
        replan();
        const pending = order.slice(i + 1).filter(k => ruleByKey.has(k) && !plan.has(k));
        const end = Date.now() + 1500;
        while (pending.length && !pending.some(k => plan.has(k)) && looksLoading() && Date.now() < end) {
          await new Promise(r => setTimeout(r, 150));
          replan();
        }
      }
    }

    deepActiveElement()?.blur?.();
    const filledBase = new Set([...filledKeys].flatMap(k => allRules.find(r => r.key === k)?.base || [k]));
    const offered = new Set(Object.keys(payload.values || {}).filter(k => payload.values[k]));
    for (const cf of payload.custom || []) offered.add(cf.id);
    return {
      filled: [...filledBase],
      missed: [...offered].filter(k => !filledBase.has(k)),
      values: written,
    };
  }

  /** How many recognizable fields the best form in this frame has. */
  function scan(payload) {
    const rules = rulesFor(payload);
    const ranked = rank(collect(), rules, payload?.mappings?.[location.origin]);
    const group = pickGroup(ranked, 1) || [];
    const active = deepActiveElement();
    return {
      fields: new Set(group.map(m => m.key)).size,
      focused: Boolean(active && group.some(m => m.el === active)),
    };
  }

  /** CSS selector for the focused field (right-clicked fields get focus), flashing it. */
  function focusedSelector() {
    const el = deepActiveElement();
    if (!el || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return null;
    if (el.getRootNode() !== document) return null; // selectors can't reach into shadow DOM
    highlight(el);
    return selectorFor(el);
  }

  FF.content = { fill, scan, focusedSelector };
})(globalThis);
