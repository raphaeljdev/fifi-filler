// lib/fake.js — realistic fake Brazilian profile generator for testing forms.
// Classic script shared by popup and background (global FF).
(function (root) {
  'use strict';
  const FF = (root.FF = root.FF || {});

  const FIRST = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
    'Larissa', 'Lucas', 'Mariana', 'Matheus', 'Natália', 'Pedro', 'Rafaela', 'Rodrigo', 'Sofia', 'Thiago', 'Vitória', 'Gustavo'];
  const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
    'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Barbosa', 'Rocha', 'Dias', 'Moreira'];
  const STREETS = ['Rua das Flores', 'Avenida Brasil', 'Rua XV de Novembro', 'Rua Sete de Setembro', 'Avenida Paulista',
    'Rua Dom Pedro II', 'Rua São José', 'Avenida Getúlio Vargas', 'Rua Tiradentes', 'Rua Santos Dumont'];
  const BAIRROS = ['Centro', 'Jardim América', 'Vila Nova', 'Boa Vista', 'Santa Cecília', 'Bela Vista', 'Jardim Europa', 'Liberdade'];
  // [city, UF, DDD, CEP prefix]
  const CITIES = [
    ['São Paulo', 'SP', '11', '01'], ['Campinas', 'SP', '19', '13'], ['Rio de Janeiro', 'RJ', '21', '20'],
    ['Belo Horizonte', 'MG', '31', '30'], ['Curitiba', 'PR', '41', '80'], ['Porto Alegre', 'RS', '51', '90'],
    ['Salvador', 'BA', '71', '40'], ['Recife', 'PE', '81', '50'], ['Fortaleza', 'CE', '85', '60'],
    ['Brasília', 'DF', '61', '70'], ['Florianópolis', 'SC', '48', '88'], ['Goiânia', 'GO', '62', '74'],
  ];
  const INSTITUTIONS = ['Universidade de São Paulo', 'UNICAMP', 'UFRJ', 'UFMG', 'UFPR', 'PUC-SP', 'Mackenzie', 'UnB'];
  const COURSES = ['Engenharia de Software', 'Direito', 'Medicina', 'Administração', 'Arquitetura', 'Ciência da Computação', 'Psicologia'];

  const int = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pick = arr => arr[int(0, arr.length - 1)];
  const nDigits = n => Array.from({ length: n }, () => int(0, 9)).join('');
  const pad = n => String(n).padStart(2, '0');

  function cpf() {
    const d = Array.from({ length: 9 }, () => int(0, 9));
    for (const n of [9, 10]) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += d[i] * (n + 1 - i);
      const r = (sum * 10) % 11;
      d.push(r === 10 ? 0 : r);
    }
    return FF.br.formatCPF(d.join(''));
  }

  function date(minYearsAgo, maxYearsAgo) {
    const now = new Date();
    const y = now.getFullYear() - int(minYearsAgo, maxYearsAgo);
    const m = int(1, 12);
    const d = int(1, 28);
    return `${pad(d)}/${pad(m)}/${y}`;
  }

  function futureDate() {
    const y = new Date().getFullYear() + int(1, 2);
    return `${pad(int(1, 28))}/${pad(int(1, 12))}/${y}`;
  }

  function password() {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
    const chars = sets.map(pick);
    const all = sets.join('');
    while (chars.length < 14) chars.push(pick(all));
    return chars.sort(() => Math.random() - 0.5).join('');
  }

  function slug(s) {
    return FF.br.normalize(s).replace(/[^a-z0-9]+/g, '');
  }

  function profile() {
    const firstName = pick(FIRST);
    const lastName = `${pick(LAST)} ${pick(LAST)}`;
    const [city, state, ddd, cepPrefix] = pick(CITIES);
    return {
      firstName,
      lastName,
      cpf: cpf(),
      dateOfBirth: date(18, 60),
      email: `${slug(firstName)}.${slug(lastName.split(' ')[0])}${int(10, 999)}@example.com`,
      phone: FF.br.formatPhone(`${ddd}9${nDigits(8)}`),
      password: password(),
      zip: FF.br.formatCEP(`${cepPrefix}${nDigits(6)}`),
      street: pick(STREETS),
      number: String(int(1, 2500)),
      complement: Math.random() < 0.4 ? `Apto ${int(1, 30)}${int(0, 9)}` : '',
      neighborhood: pick(BAIRROS),
      city,
      state,
      cie: nDigits(10),
      validityDate: futureDate(),
      institutionName: pick(INSTITUTIONS),
      course: pick(COURSES),
    };
  }

  FF.fake = { profile, cpf, password };
})(globalThis);
