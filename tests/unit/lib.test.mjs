import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FF } from './setup.mjs';

const { br, fields, fake } = FF;

test('CPF validation', () => {
  assert.equal(br.isValidCPF('529.982.247-25'), true);
  assert.equal(br.isValidCPF('52998224725'), true);
  assert.equal(br.isValidCPF('529.982.247-24'), false);
  assert.equal(br.isValidCPF('111.111.111-11'), false);
  assert.equal(br.isValidCPF('123'), false);
});

test('formatters', () => {
  assert.equal(br.formatCPF('52998224725'), '529.982.247-25');
  assert.equal(br.formatCEP('01310100'), '01310-100');
  assert.equal(br.formatDate('15031990'), '15/03/1990');
  assert.equal(br.formatPhone('11999990000'), '(11) 99999-0000');
  assert.equal(br.formatPhone('+55 11 3333-4444'), '(11) 3333-4444');
});

test('dates, states, email', () => {
  assert.deepEqual(br.parseDate('29/02/2024'), { d: 29, m: 2, y: 2024 });
  assert.equal(br.parseDate('29/02/2023'), null);
  assert.equal(br.toISODate('05/01/2000'), '2000-01-05');
  assert.deepEqual(br.findState('sao paulo'), ['SP', 'São Paulo']);
  assert.deepEqual(br.findState('rj'), ['RJ', 'Rio de Janeiro']);
  assert.equal(br.isValidEmail('a@b.co'), true);
  assert.equal(br.isValidEmail('a@b'), false);
});

test('fake profiles are valid', () => {
  for (let i = 0; i < 200; i++) {
    const p = fake.profile();
    assert.ok(br.isValidCPF(p.cpf), p.cpf);
    assert.ok(br.parseDate(p.dateOfBirth), p.dateOfBirth);
    assert.ok(br.isValidPhone(p.phone), p.phone);
    assert.ok(br.isValidCEP(p.zip), p.zip);
    assert.ok(br.isValidEmail(p.email), p.email);
    assert.ok(br.findState(p.state));
    assert.match(p.password, /[A-Z]/);
    assert.match(p.password, /[0-9]/);
  }
});

test('expand derives split values', () => {
  const v = fields.expand({ firstName: 'Ana', lastName: 'Lima', phone: '(11) 98888-7777', dateOfBirth: '05/01/2000', street: 'Rua A', number: '10', state: 'são paulo' });
  assert.equal(v.fullName, 'Ana Lima');
  assert.equal(v.phone, '11988887777');
  assert.equal(v.phoneDdd, '11');
  assert.equal(v.phoneLocal, '988887777');
  assert.equal(v.birthMonth, '01');
  assert.equal(v.birthYear, '2000');
  assert.equal(v.dateOfBirthISO, '2000-01-05');
  assert.equal(v.addressLine, 'Rua A, 10');
  assert.equal(v.state, 'SP');
  assert.equal(v.stateName, 'São Paulo');
});

test('detection patterns avoid substring false positives', () => {
  const phone = fields.DETECT.find(r => r.key === 'phone');
  const hits = s => phone.re.some(p => p.re.test(s));
  assert.equal(hits('cancel'), false);
  assert.equal(hits('hotel'), false);
  assert.equal(hits('cel'), true);
  assert.equal(hits('telefone'), true);
});

test('custom field rule', () => {
  const rule = fields.customRule({ id: 'cf_1', label: 'RG', patterns: 'rg, identidade' });
  assert.ok(rule.re[0].re.test('numero do rg'));
  assert.ok(rule.re[0].re.test('identidade'));
  assert.ok(!rule.re[0].re.test('cargo'));
});
