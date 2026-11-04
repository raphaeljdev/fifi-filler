// lib/fields.js — profile schema and page-field detection rules.
// Classic script shared by popup, background and content scripts (global FF).
(function (root) {
  'use strict';
  const FF = (root.FF = root.FF || {});

  /**
   * Fields the user edits in the popup. `mask` drives live formatting and
   * validation in the popup; order defines the popup layout.
   */
  const PROFILE_FIELDS = [
    { key: 'firstName', section: 'personal', icon: 'user', placeholder: 'João' },
    { key: 'lastName', section: 'personal', icon: 'user', placeholder: 'Silva' },
    { key: 'cpf', section: 'personal', icon: 'id', mask: 'cpf', placeholder: '000.000.000-00', half: true },
    { key: 'dateOfBirth', section: 'personal', icon: 'cake', mask: 'date', placeholder: 'DD/MM/AAAA', half: true },
    { key: 'email', section: 'personal', icon: 'mail', mask: 'email', type: 'email', placeholder: 'joao@email.com' },
    { key: 'phone', section: 'personal', icon: 'phone', mask: 'phone', type: 'tel', placeholder: '(11) 99999-0000' },
    { key: 'password', section: 'personal', icon: 'lock', secret: true },

    { key: 'zip', section: 'address', icon: 'pin', mask: 'cep', placeholder: '01310-100' },
    { key: 'street', section: 'address', icon: 'home', placeholder: 'Av. Paulista' },
    { key: 'number', section: 'address', icon: 'hash', placeholder: '1000', half: true },
    { key: 'complement', section: 'address', icon: 'hash', placeholder: 'Apto 12', half: true },
    { key: 'neighborhood', section: 'address', icon: 'map', placeholder: 'Bela Vista' },
    { key: 'city', section: 'address', icon: 'city', placeholder: 'São Paulo', half: true },
    { key: 'state', section: 'address', icon: 'map', mask: 'uf', placeholder: 'SP', half: true },

    { key: 'cie', section: 'student', icon: 'cap', placeholder: '' },
    { key: 'validityDate', section: 'student', icon: 'calendar', mask: 'date', placeholder: 'DD/MM/AAAA' },
    { key: 'institutionName', section: 'student', icon: 'school', placeholder: 'USP, UNICAMP…' },
    { key: 'course', section: 'student', icon: 'book', placeholder: 'Engenharia, Direito…' },
  ];

  const PROFILE_KEYS = PROFILE_FIELDS.map(f => f.key);

  const re = (src, w = 1) => ({ re: new RegExp(`\\b(?:${src})\\b`), w });

  /**
   * Detection rules. Hints are normalized (lowercase, no accents, camelCase and
   * punctuation split into words) before matching, so patterns use word
   * boundaries to avoid hits like "cel" in "cancel" or "tel" in "hotel".
   *  - ac:    autocomplete tokens (strongest signal)
   *  - ids:   exact id/name values (compacted, no separators)
   *  - re:    weighted patterns tested against each hint source
   *  - neg:   pattern that disqualifies a hint source
   *  - base:  profile keys this (possibly derived) field comes from
   *  - multi: may fill several elements (e.g. "confirm e-mail")
   */
  const DETECT = [
    { key: 'fullName', base: ['firstName', 'lastName'], ac: ['name'], ids: ['name', 'fullname', 'nome', 'nomecompleto'],
      re: [re('nome completo|full name|seu nome|your name|nome|name')],
      neg: /\b(?:user ?name|usuario|login|empresa|company|cartao|card|titular|first|last|sobrenome|mae|pai|social|nick|apelido|arquivo|file|fantasia|instituicao|institution|escola|school|curso|course|rua|street|cidade|city|bairro|estado|state)\b/ },
    { key: 'firstName', base: ['firstName'], ac: ['given-name'], ids: ['firstname', 'fname', 'primeironome'],
      re: [re('first ?name|given ?name|primeiro nome|fname|prenome')] },
    { key: 'lastName', base: ['lastName'], ac: ['family-name'], ids: ['lastname', 'lname', 'sobrenome', 'surname'],
      re: [re('last ?name|family ?name|surname|sobrenome|ultimo nome|lname')] },
    { key: 'email', base: ['email'], multi: true, ac: ['email'], ids: ['email', 'mail'],
      re: [re('e ?mail|correio eletronico')] },
    { key: 'phoneDdd', base: ['phone'], masked: true, ac: ['tel-area-code'], ids: ['ddd'],
      re: [re('ddd|area code|codigo de area')] },
    { key: 'phone', base: ['phone'], masked: true, ac: ['tel', 'tel-national', 'tel-local'], ids: ['phone', 'telefone', 'celular', 'tel', 'mobile'],
      re: [re('phone|telefone|celular|cel|mobile|telephone|tel|fone|whatsapp|whats')],
      neg: /\b(?:ddd|area code|codigo de area|ddi|country|pais)\b/ },
    { key: 'password', base: ['password'], multi: true, passwordOnly: true, ac: ['new-password', 'current-password'], ids: ['password', 'senha'],
      re: [re('password|senha|pass|pwd|passwd|passcode')] },
    { key: 'cpf', base: ['cpf'], masked: true, ids: ['cpf', 'documentnumber', 'cpfcnpj'],
      re: [re('cpf'), re('documento|document|doc number|numero do documento|tax ?id', 0.7)],
      neg: /\b(?:rg|cnpj|identidade|passaporte|passport|tipo|type|estudante|student|cie)\b/ },
    { key: 'dateOfBirth', base: ['dateOfBirth'], masked: true, ac: ['bday'], ids: ['dateofbirth', 'birthdate', 'birthday', 'dob', 'datanascimento', 'nascimento'],
      re: [re('data de nascimento|nascimento|nasc|birth ?date|birthday|date of birth|dob|bday')] },
    { key: 'birthDay', base: ['dateOfBirth'], ac: ['bday-day'], ids: ['birthday_day', 'dobday', 'diadenascimento', 'dianascimento'],
      re: [re('(?:dia|day) (?:de )?(?:nascimento|nasc|birth)|(?:birth|dob|bday) day')] },
    { key: 'birthMonth', base: ['dateOfBirth'], ac: ['bday-month'], ids: ['dobmonth', 'mesnascimento'],
      re: [re('(?:mes|month) (?:de )?(?:nascimento|nasc|birth)|(?:birth|dob|bday) month')] },
    { key: 'birthYear', base: ['dateOfBirth'], ac: ['bday-year'], ids: ['dobyear', 'anonascimento'],
      re: [re('(?:ano|year) (?:de )?(?:nascimento|nasc|birth)|(?:birth|dob|bday) year')] },
    { key: 'zip', base: ['zip'], masked: true, ac: ['postal-code'], ids: ['zip', 'cep', 'zipcode', 'postalcode'],
      re: [re('cep|zip|zip ?code|postal|postcode|codigo postal')] },
    { key: 'street', base: ['street'], ac: ['address-line1', 'street-address'], ids: ['address', 'street', 'rua', 'logradouro', 'endereco'],
      re: [re('rua|logradouro|street|endereco|address|address ?line ?1|avenida')],
      neg: /\b(?:e ?mail|ip|complemento|bairro|cidade|city|zip|cep|numero|number|line ?2|mac)\b/ },
    { key: 'number', base: ['number'], ids: ['number', 'numero', 'num', 'nro', 'addressnumber', 'streetnumber'],
      re: [re('numero|number|num|nro', 0.8)],
      neg: /\b(?:cartao|card|telefone|phone|celular|documento|document|cpf|cie|carteira|matricula|pedido|order|whatsapp|contato|tel)\b/ },
    { key: 'complement', base: ['complement'], ac: ['address-line2'], ids: ['complement', 'complemento'],
      re: [re('complemento|complement|apto|apartamento|apartment|suite|bloco|address ?line ?2')] },
    { key: 'neighborhood', base: ['neighborhood'], ac: ['address-level3'], ids: ['bairro', 'neighborhood', 'district'],
      re: [re('bairro|neighbou?rhood|district|distrito')] },
    { key: 'city', base: ['city'], ac: ['address-level2'], ids: ['city', 'cidade', 'municipio'],
      re: [re('cidade|city|town|municipio|localidade')] },
    { key: 'state', base: ['state'], ac: ['address-level1'], ids: ['state', 'estado', 'uf'],
      re: [re('estado|state|uf|province|provincia|region|regiao')],
      neg: /\b(?:civil|marital)\b/ },
    { key: 'cie', base: ['cie'], ids: ['cie', 'studentid'],
      re: [re('cie|carteira de estudante|carteira estudantil|carteira do estudante|student id|id estudantil|documento do estudante')] },
    { key: 'validityDate', base: ['validityDate'], masked: true, ids: ['validitydate', 'validade'],
      re: [re('validade|data de validade|expiracao|expiry|expiration|validity|vencimento|valido ate')],
      neg: /\b(?:cartao|card|cvv|cvc|credit|credito)\b/ },
    { key: 'institutionName', base: ['institutionName'], ids: ['institutionname', 'instituicao', 'institution'],
      re: [re('instituicao|institution|escola|universidade|faculdade|university|college|school')] },
    { key: 'course', base: ['course'], ids: ['course', 'curso'],
      re: [re('curso|course|degree|graduacao')],
      neg: /\b(?:ano|year|periodo|semestre)\b/ },
  ];

  /** Fill order. Selects that drive other selects (state) and the CEP (sites auto-fill the address from it) come first. */
  const FILL_ORDER = [
    'fullName', 'firstName', 'lastName', 'email', 'phoneDdd', 'phone', 'password',
    'cpf', 'dateOfBirth', 'birthDay', 'birthMonth', 'birthYear',
    'zip', 'state', 'city', 'street', 'number', 'complement', 'neighborhood',
    'cie', 'validityDate', 'institutionName', 'course',
  ];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Turns a user custom field ({id, label, patterns: "rg, identidade"}) into a detection rule. */
  function customRule(cf) {
    const words = String(cf.patterns || cf.label || '')
      .split(',')
      .map(w => FF.br.normalize(w))
      .filter(Boolean)
      .map(escapeRe);
    if (!words.length) return null;
    return { key: cf.id, base: [cf.id], custom: true, ids: words.map(w => w.replace(/\W/g, '')), re: [re(words.join('|'))] };
  }

  /** Adds derived values (full name, split phone/date, ISO dates…) to raw profile values. */
  function expand(values) {
    const br = FF.br;
    const v = { ...values };
    v.fullName = [values.firstName, values.lastName].filter(Boolean).join(' ').trim();

    const phone = br.phoneDigits(values.phone);
    v.phone = phone;
    v.phoneDdd = phone.length >= 10 ? phone.slice(0, 2) : '';
    v.phoneLocal = phone.length >= 10 ? phone.slice(2) : phone;

    const dob = br.parseDate(values.dateOfBirth);
    v.birthDay = dob ? String(dob.d).padStart(2, '0') : '';
    v.birthMonth = dob ? String(dob.m).padStart(2, '0') : '';
    v.birthYear = dob ? String(dob.y) : '';
    v.dateOfBirthISO = br.toISODate(values.dateOfBirth);
    v.validityDateISO = br.toISODate(values.validityDate);

    v.addressLine = [values.street, values.number].filter(Boolean).join(', ');
    const st = br.findState(values.state);
    v.state = st ? st[0] : (values.state || '');
    v.stateName = st ? st[1] : '';
    return v;
  }

  FF.fields = { PROFILE_FIELDS, PROFILE_KEYS, DETECT, FILL_ORDER, customRule, expand };
})(globalThis);
