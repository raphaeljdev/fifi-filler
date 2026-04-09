const ALL_FIELDS = [
  'firstName','lastName','email','phone','password','address','city','state','zip',
  'cpf','dateOfBirth','cie','validityDate','institutionName','course'
];

const nativeInputSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set;
const nativeSelectSetter = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype, 'value'
)?.set;

function digitsOnly(str) {
  return String(str).replace(/\D/g, '');
}

function triggerReactEvents(el) {
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Fast fill para React ─────────────────────────────────────────────────────
function fastFill(el, value) {
  if (!el || el.disabled || el.readOnly) return false;

  if (el.tagName === 'SELECT') {
    if (nativeSelectSetter) nativeSelectSetter.call(el, value);
    else el.value = value;
    triggerReactEvents(el);
    return true;
  }

  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  if (nativeInputSetter) {
    nativeInputSetter.call(el, '');
    triggerReactEvents(el);
  }

  el.select?.();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, value);

  triggerReactEvents(el);
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  return true;
}

// ─── Para campos mascarados (CPF, data, etc.) ────────────────────────────────
async function maskedFill(el, value) {
  if (!el || el.disabled || el.readOnly) return false;

  const digits = digitsOnly(value);

  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  if (nativeInputSetter) {
    nativeInputSetter.call(el, '');
    triggerReactEvents(el);
  }

  el.select?.();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  for (const digit of digits) {
    document.execCommand('insertText', false, digit);
    await new Promise(r => setTimeout(r, 12));
  }

  triggerReactEvents(el);
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  return true;
}

// ─── Retorna hints descritivos de um elemento ─────────────────────────────────
function getElementHints(el) {
  const parts = [
    el.name, el.id, el.placeholder,
    el.getAttribute('aria-label'),
    el.getAttribute('autocomplete'),
    el.getAttribute('data-testid'),
    el.getAttribute('data-field'),
    el.getAttribute('data-qa'),
    el.className,
  ].map(a => (a || '').toLowerCase());

  if (el.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent.toLowerCase());
    } catch(e) {}
  }

  const parentLabel = el.closest('label');
  if (parentLabel) parts.push(parentLabel.textContent.toLowerCase());

  const parentBlock = el.closest('div, fieldset, td, li');
  if (parentBlock) {
    const labelEl = parentBlock.querySelector('label, [class*="label"], [class*="Label"]');
    if (labelEl) parts.push(labelEl.textContent.toLowerCase());
  }

  return parts.join(' ');
}

// ─── Verifica se elemento está visível ───────────────────────────────────────
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// ─── Coleta todos inputs visíveis/ativos em ordem DOM ────────────────────────
function getAllVisibleInputs() {
  return Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="image"]), textarea, select'
  )).filter(el => isVisible(el) && !el.disabled);
}

// ─── Divide inputs em grupos de formulário por distância vertical no DOM ─────
// Dois inputs pertencem ao mesmo grupo se estão próximos verticalmente
// OU se compartilham um ancestral comum dentro de 8 níveis
function splitIntoFormGroups(inputs) {
  if (inputs.length === 0) return [];

  const groups = [];
  let current = [inputs[0]];

  for (let i = 1; i < inputs.length; i++) {
    const prev = inputs[i - 1];
    const curr = inputs[i];

    // Checa ancestral compartilhado (até 8 níveis)
    const shareAncestor = (() => {
      let node = curr.parentElement;
      for (let d = 0; d < 8; d++) {
        if (!node) break;
        if (node.contains(prev)) return true;
        node = node.parentElement;
      }
      return false;
    })();

    const prevRect = prev.getBoundingClientRect();
    const currRect = curr.getBoundingClientRect();
    const gap = currRect.top - prevRect.bottom;

    // Separa grupo se gap vertical > 100px E sem ancestral próximo
    if (!shareAncestor && gap > 100) {
      groups.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// ─── Escolhe o grupo-alvo: o que tem mais campos de texto vazios ──────────────
function pickTargetGroup(groups) {
  if (!groups || groups.length === 0) return null;
  if (groups.length === 1) return groups[0];

  const scored = groups.map(group => {
    const textInputs = group.filter(el => el.tagName !== 'SELECT' && el.type !== 'password');
    const emptyCount = textInputs.filter(el => !el.value?.trim()).length;
    return { group, emptyCount };
  });

  // Grupo com mais campos vazios = próximo a ser preenchido
  scored.sort((a, b) => b.emptyCount - a.emptyCount);
  return scored[0].group;
}

// ─── Encontra campo correto dentro de um grupo ───────────────────────────────
function findInGroup(group, exactIds, patterns, isPassword) {
  // 1) Exact match por id ou name
  for (const id of exactIds) {
    const el = group.find(el => el.id === id || el.name === id);
    if (el) return el;
  }

  // 2) Pattern match nas hints
  for (const el of group) {
    if (isPassword && el.type !== 'password') continue;
    if (!isPassword && el.type === 'password') continue;

    const hints = getElementHints(el);
    if (patterns.some(p => hints.includes(p))) return el;
  }

  return null;
}

const FIELD_MAP = {
  firstName:       { exactIds: ['firstName','first-name'],    patterns: ['firstname','first_name','nome','fname','given-name','first name'],              masked: false },
  lastName:        { exactIds: ['lastName','last-name'],      patterns: ['lastname','last_name','sobrenome','surname','family-name','last name'],          masked: false },
  email:           { exactIds: ['email'],                     patterns: ['email','e-mail','mail'],                                                         masked: false },
  phone:           { exactIds: ['phone'],                     patterns: ['phone','mobile','telephone','cel','cellphone','tel','fone'],                     masked: true  },
  address:         { exactIds: ['address'],                   patterns: ['address','street','addr','endereco','endereço'],                                 masked: false },
  state:           { exactIds: ['state'],                     patterns: ['state','estado','province','region','uf'],                                       masked: false },
  city:            { exactIds: ['city'],                      patterns: ['city','town','cidade','municipio','município'],                                  masked: false },
  zip:             { exactIds: ['zip'],                       patterns: ['zip','postal','postcode','cep'],                                                  masked: false },
  cpf:             { exactIds: ['documentNumber','cpf'],      patterns: ['cpf','document','documento','doc'],                                              masked: true  },
  dateOfBirth:     { exactIds: ['dateOfBirth','birthdate'],   patterns: ['nascimento','birthdate','birth','date_of_birth','dob','data de nasc'],           masked: true  },
  cie:             { exactIds: ['CIE','cie'],                 patterns: ['cie','student id','id estudante','carteira estudantil'],                         masked: false },
  validityDate:    { exactIds: ['validityDate'],              patterns: ['validade','expiracao','expiração','expiry','validity','data de expira'],          masked: true  },
  institutionName: { exactIds: ['institutionName'],           patterns: ['instituicao','instituição','institution','escola','universidade','faculdade','nome da inst'], masked: false },
  course:          { exactIds: ['course'],                    patterns: ['curso','course','degree'],                                                       masked: false },
  password:        { exactIds: ['password'],                  patterns: ['password','senha','pass','pwd','passwd'],                                        masked: false, type: 'password' },
};

// state DEVE vir antes de city (o select de estado popula as opções de cidade)
const FILL_ORDER = [
  'firstName','lastName','email','phone','password',
  'address','state','city','zip',
  'cpf','dateOfBirth','cie','validityDate','institutionName','course'
];

async function fillForms(profile) {
  let filled = 0;

  const allInputs = getAllVisibleInputs();
  const groups = splitIntoFormGroups(allInputs);
  let targetGroup = pickTargetGroup(groups);

  if (!targetGroup || targetGroup.length === 0) return 0;

  let stateWasFilled = false;

  for (const key of FILL_ORDER) {
    const config = FIELD_MAP[key];
    if (!config) continue;

    const value = profile[key];
    if (!value) continue;

    // Após preencher state, aguarda React re-renderizar as opções de cidade
    if (key === 'city' && stateWasFilled) {
      await new Promise(r => setTimeout(r, 400));
      // Re-detecta grupo pois o DOM pode ter mudado
      const freshGroups = splitIntoFormGroups(getAllVisibleInputs());
      targetGroup = pickTargetGroup(freshGroups) || targetGroup;
    }

    const el = findInGroup(targetGroup, config.exactIds, config.patterns, config.type === 'password');
    if (!el) continue;

    let ok;
    if (config.masked) {
      ok = await maskedFill(el, value);
    } else {
      ok = fastFill(el, value);
    }

    if (ok) {
      filled++;
      if (key === 'state') stateWasFilled = true;
    }
  }

  return filled;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fillForms') {
    fillForms(msg.profile).then(count => sendResponse({ filled: count }));
    return true;
  }
  return true;
});

chrome.storage.local.get(['autoFill', ...ALL_FIELDS], (data) => {
  if (!data.autoFill) return;
  setTimeout(() => {
    const profile = {};
    ALL_FIELDS.forEach(k => profile[k] = data[k] || '');
    fillForms(profile);
  }, 1500);
});
