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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


async function fillByTyping(el, value) {
  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await sleep(50);

  el.select?.();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(40);

  document.execCommand('insertText', false, value);
  await sleep(30);

  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

async function fillMasked(el, digits) {
  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await sleep(40);

  el.select?.();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(40);

  for (const digit of digits) {
    document.execCommand('insertText', false, digit);
    await sleep(35);
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

async function fillField(el, value, masked = false) {
  if (!el || el.disabled || el.readOnly) return false;

  if (el.tagName === 'SELECT') {
    if (nativeSelectSetter) nativeSelectSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (masked) {
    await fillMasked(el, digitsOnly(value));
  } else {
    await fillByTyping(el, value);
  }
  return true;
}

function findField(exactIds, fallbackPatterns, passwordOnly = false) {
  for (const id of exactIds) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  if (!fallbackPatterns?.length) return null;

  const selector = passwordOnly
    ? 'input[type="password"]'
    : 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea, select';

  const inputs = document.querySelectorAll(selector);

  for (const el of inputs) {
    const attrs = [
      el.name, el.id, el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('autocomplete'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-field'),
      el.getAttribute('data-qa'),
    ].map(a => (a || '').toLowerCase());

    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) attrs.push(label.textContent.toLowerCase());
    }
    if (el.closest('label')) attrs.push(el.closest('label').textContent.toLowerCase());

    const combined = attrs.join(' ');
    if (fallbackPatterns.some(p => combined.includes(p.toLowerCase()))) return el;
  }
  return null;
}

const FIELD_MAP = {
  firstName:       { exactIds: ['firstName'],       fallback: ['firstname','first_name','nome','fname','given-name', 'firstNameGroup'],        masked: false },
  lastName:        { exactIds: ['lastName'],         fallback: ['lastname','last_name','sobrenome','surname','family-name', 'lastNameGroup'],  masked: false },
  email:           { exactIds: ['email'],            fallback: ['email','e-mail','mail'],                                    masked: false },
  phone:           { exactIds: ['phone'],            fallback: ['phone','mobile','telephone','cel','cellphone','tel'],        masked: true  },
  address:         { exactIds: ['address'],          fallback: ['address','street','addr','endereco'],                       masked: false },
  city:            { exactIds: ['city'],             fallback: ['city','town','cidade'],                                     masked: false },
  state:           { exactIds: ['state'],            fallback: ['state','estado','province','region'],                       masked: false },
  zip:             { exactIds: ['zip'],              fallback: ['zip','postal','postcode','cep'],                            masked: false },
  cpf:             { exactIds: ['documentNumber'],   fallback: ['cpf','document','documento'],                              masked: true  },
  dateOfBirth:     { exactIds: ['dateOfBirth'],      fallback: ['nascimento','birthdate','date_of_birth','dob'],             masked: true  },
  cie:             { exactIds: ['CIE'],              fallback: ['cie','student id','id estudante'],                          masked: false },
  validityDate:    { exactIds: ['validityDate'],     fallback: ['validade','expiracao','expiry','validity'],                 masked: true  },
  institutionName: { exactIds: ['institutionName'],  fallback: ['instituicao','institution','escola','universidade'],        masked: false },
  course:          { exactIds: ['course'],           fallback: ['curso','course','degree'],                                 masked: false },
  password:        { exactIds: ['password'],         fallback: ['password','senha','pass','pwd','passwd'],                  masked: false, type: 'password' },
};

async function fillForms(profile) {
  let filled = 0;
  for (const [key, { exactIds, fallback, masked, type }] of Object.entries(FIELD_MAP)) {
    const value = profile[key];
    if (!value) continue;
    const el = findField(exactIds, fallback, type === 'password');
    if (el) {
      const ok = await fillField(el, value, masked);
      if (ok) filled++;
      await sleep(80);
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
