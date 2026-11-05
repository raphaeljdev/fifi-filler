// lib/br.js — Brazilian data helpers: formatting, validation, states.
// Classic script shared by popup, background and content scripts (global FF).
(function (root) {
  'use strict';
  const FF = (root.FF = root.FF || {});

  const STATES = [
    ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'],
    ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'],
    ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'],
    ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
    ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
    ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'],
    ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins'],
  ];

  const MONTHS = {
    pt: ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  };

  function digits(s) {
    return String(s ?? '').replace(/\D/g, '');
  }

  /** Lowercase, strip accents, collapse whitespace. */
  function normalize(s) {
    return String(s ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function cpfCheckDigit(d, n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  }

  function isValidCPF(value) {
    const d = digits(value);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    return cpfCheckDigit(d, 9) === Number(d[9]) && cpfCheckDigit(d, 10) === Number(d[10]);
  }

  function formatCPF(value) {
    const d = digits(value).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  function formatCEP(value) {
    const d = digits(value).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  function formatDate(value) {
    const d = digits(value).slice(0, 8);
    if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
  }

  /** Strips a leading +55 country code when present. */
  function phoneDigits(value) {
    let d = digits(value);
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d;
  }

  function formatPhone(value) {
    const d = phoneDigits(value).slice(0, 11);
    if (d.length <= 2) return d;
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    const split = rest.length > 8 ? 5 : 4;
    return rest.length > split
      ? `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
      : `(${ddd}) ${rest}`;
  }

  /** Parses DD/MM/AAAA. Returns {d, m, y} or null when the date does not exist. */
  function parseDate(value) {
    const d = digits(value);
    if (d.length !== 8) return null;
    const day = Number(d.slice(0, 2));
    const month = Number(d.slice(2, 4));
    const year = Number(d.slice(4));
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
    return { d: day, m: month, y: year };
  }

  function toISODate(value) {
    const p = parseDate(value);
    if (!p) return '';
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
  }

  function isValidCEP(value) {
    return digits(value).length === 8;
  }

  function isValidPhone(value) {
    const d = phoneDigits(value);
    return d.length === 10 || d.length === 11;
  }

  /** Accepts a UF ("sp") or a state name ("São Paulo"); returns [UF, name] or null. */
  function findState(value) {
    const n = normalize(value);
    if (!n) return null;
    return STATES.find(([uf, name]) => uf.toLowerCase() === n || normalize(name) === n) || null;
  }

  FF.br = {
    STATES, MONTHS,
    digits, normalize, phoneDigits,
    isValidCPF, isValidEmail, isValidCEP, isValidPhone, parseDate, toISODate, findState,
    formatCPF, formatCEP, formatDate, formatPhone,
  };
})(globalThis);
