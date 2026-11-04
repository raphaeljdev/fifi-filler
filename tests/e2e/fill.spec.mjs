// Runs the real content script against fixture pages (no extension APIs needed).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = name => pathToFileURL(path.join(ROOT, 'tests/e2e/fixtures', name)).href;

const PROFILE = {
  firstName: 'Ana', lastName: 'Lima', email: 'ana@example.com', password: 'S3nha!forte',
  cpf: '529.982.247-25', dateOfBirth: '05/01/2000', phone: '(11) 98888-7777',
  zip: '01310-100', street: 'Avenida Paulista', number: '1000', complement: 'Apto 12',
  neighborhood: 'Bela Vista', city: 'Campinas', state: 'SP',
  validityDate: '31/12/2027',
};

async function load(page, name) {
  await page.goto(fixture(name));
  for (const f of ['lib/br.js', 'lib/fields.js', 'content.js']) await page.addScriptTag({ path: path.join(ROOT, f) });
}

function fill(page, payload = {}, opts = {}) {
  return page.evaluate(([p, o]) => FF.content.fill(p, o), [{ values: PROFILE, highlight: false, ...payload }, opts]);
}

test('basic pt-BR form: fills the signup form only, no false positives', async ({ page }) => {
  await load(page, 'basic.html');
  const res = await fill(page);
  const val = id => page.inputValue(`#${id}`);
  expect(await val('nome')).toBe('Ana');
  expect(await val('sobrenome')).toBe('Lima');
  expect(await val('mail')).toBe('ana@example.com');
  expect(await val('mail2')).toBe('ana@example.com');
  expect(await val('pw')).toBe('S3nha!forte');
  expect(await val('pw2')).toBe('S3nha!forte');
  expect(await val('doc')).toBe('529.982.247-25');
  expect(await val('nasc')).toBe('05/01/2000');
  expect(await val('cel')).toBe('11988887777');
  expect(await val('cep')).toBe('01310-100');
  expect(await val('rua')).toBe('Avenida Paulista');
  expect(await val('num')).toBe('1000');
  expect(await val('compl')).toBe('Apto 12');
  expect(await val('bairro')).toBe('Bela Vista');
  expect(await val('cidade')).toBe('Campinas');
  expect(await val('uf')).toBe('SP');
  // must stay untouched
  expect(await val('civil')).toBe('');
  expect(await val('hotel')).toBe('');
  expect(await val('card')).toBe('');
  expect(await val('newsmail')).toBe('');
  expect(await page.inputValue('input[name=q]')).toBe('');
  expect(res.filled).toEqual(expect.arrayContaining(['firstName', 'lastName', 'email', 'password', 'cpf', 'zip', 'state']));
  expect(res.missed).toEqual(['validityDate']);
});

test('masked inputs receive digits and keep the mask; unmasked dates get slashes', async ({ page }) => {
  await load(page, 'masked.html');
  await fill(page);
  const val = n => page.inputValue(`[name=${n}]`);
  expect(await val('cpf')).toBe('529.982.247-25');
  expect(await val('telefone')).toBe('(11) 98888-7777');
  expect(await val('nascimento')).toBe('05/01/2000');
  expect(await val('cep')).toBe('01310-100');
  expect(await val('validade')).toBe('31/12/2027');
});

test('native date input gets ISO value', async ({ page }) => {
  await load(page, 'masked.html');
  await page.evaluate(() => {
    for (const n of ['cpf', 'telefone', 'nascimento', 'cep', 'validade']) document.querySelector(`[name=${n}]`).remove();
  });
  await fill(page);
  expect(await page.inputValue('[name=birthdate]')).toBe('2000-01-05');
});

test('React controlled inputs update component state', async ({ page }) => {
  await load(page, 'react.html');
  await fill(page);
  const state = JSON.parse(await page.textContent('#state'));
  expect(state).toMatchObject({ firstName: 'Ana', lastName: 'Lima', email: 'ana@example.com', phone: '11988887777', zip: '01310-100', state: 'SP' });
});

test('dependent selects: waits for city options after state', async ({ page }) => {
  await load(page, 'dependent.html');
  await fill(page);
  expect(await page.inputValue('#estado')).toBe('2');
  expect(await page.$eval('#cidade', s => s.selectedOptions[0].textContent)).toBe('Campinas');
});

test('shadow DOM fields are filled', async ({ page }) => {
  await load(page, 'shadow.html');
  await fill(page);
  const vals = await page.evaluate(() => {
    const r = document.querySelector('checkout-form').shadowRoot;
    return ['em', 'fn', 'pc'].map(id => r.getElementById(id).value);
  });
  expect(vals).toEqual(['ana@example.com', 'Ana Lima', '01310-100']);
});

test('autocomplete attributes, split phone/date, and manual mappings', async ({ page }) => {
  await load(page, 'autocomplete.html');
  const origin = await page.evaluate(() => location.origin);
  await fill(page, { mappings: { [origin]: { 'input[name="weird_x1"]': 'cpf' } } });
  const val = n => page.inputValue(`[name=${n}]`);
  expect(await val('f1')).toBe('Ana');
  expect(await val('f2')).toBe('Lima');
  expect(await val('f3')).toBe('11');
  expect(await val('f4')).toBe('988887777');
  expect(await val('f5')).toBe('5');
  expect(await val('f6')).toBe('1');
  expect(await val('f7')).toBe('2000');
  expect(await val('f8')).toBe('01310-100');
  expect(await val('weird_x1')).toBe('529.982.247-25');
});

test('lone "Nome" gets the full name; username and custom fields', async ({ page }) => {
  await load(page, 'fullname.html');
  await fill(page, { custom: [{ id: 'cf_rg', label: 'RG', patterns: 'rg, identidade', value: '12.345.678-9' }] });
  expect(await page.inputValue('#n')).toBe('Ana Lima');
  expect(await page.inputValue('#e')).toBe('ana@example.com');
  expect(await page.inputValue('#u')).toBe('');
  expect(await page.inputValue('#rg')).toBe('12.345.678-9');
});

test('auto mode only fills empty fields and needs 2+ recognized fields', async ({ page }) => {
  await load(page, 'basic.html');
  await page.fill('#nome', 'Typed');
  await fill(page, {}, { auto: true });
  expect(await page.inputValue('#nome')).toBe('Typed');
  expect(await page.inputValue('#sobrenome')).toBe('Lima');

  // A lone e-mail box (newsletter-like) is not a form worth auto-filling.
  await load(page, 'basic.html');
  await page.evaluate(() => document.getElementById('signup').remove());
  const res = await fill(page, {}, { auto: true });
  expect(res.filled).toEqual([]);
  expect(await page.inputValue('#newsmail')).toBe('');
});

test('scan counts recognized fields', async ({ page }) => {
  await load(page, 'basic.html');
  const s = await page.evaluate(() => FF.content.scan({}));
  expect(s.fields).toBeGreaterThanOrEqual(14);
});
