# Fifi-Filler

> Extensão do Chrome que preenche formulários de cadastro e checkout a partir dos seus perfis. Tem detecção inteligente de campos, busca de CEP, senhas criptografadas e gerador de dados de teste.

![Version](https://img.shields.io/badge/versão-2.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-v3-green)
![CI](https://github.com/raphaeljdev/fifi-filler/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/licença-MIT-lightgrey)

## Funcionalidades

| | |
|---|---|
| **Perfis ilimitados** | Crie, renomeie, duplique e alterne perfis ("Pessoal", "Trabalho", "Teste"…) |
| **Detecção por pontuação** | Usa `autocomplete`, `id`/`name`, `<label>`, `aria-label`, placeholder e texto próximo, com padrões por palavra inteira ("cel" não casa com "cancel") |
| **Formulários modernos** | React/Vue (eventos nativos), máscaras (digitação dígito a dígito), Shadow DOM, iframes, selects dependentes (UF → cidade), `input type="date"` |
| **Campos brasileiros** | CPF, CEP, DDD separado, número/complemento/bairro, UF por sigla ou nome, dia/mês/ano separados, dados de meia-entrada (CIE) |
| **Busca de CEP** | Digite o CEP e o endereço se completa via ViaCEP |
| **Validação** | CPF (dígitos verificadores), data, CEP, telefone e e-mail validados no popup |
| **Senhas criptografadas** | AES-256-GCM com senha mestra (PBKDF2). Sem senha mestra, senhas não são salvas |
| **Auto-preenchimento por site** | Ligue só nos sites que quiser. A permissão é pedida por site e preenche só campos vazios, inclusive em SPAs |
| **Mapeamento manual** | Clique direito num campo › *Mapear este campo como…* para ensinar campos que não são reconhecidos |
| **Campos personalizados** | Crie campos (ex.: RG, Matrícula) com suas próprias palavras-chave |
| **Dados de teste** | Gera perfis fictícios válidos (CPF, telefone, CEP, senha forte) para QA, sem salvar nada |
| **Atalho e menu de contexto** | `Alt+Shift+F` preenche sem abrir o popup. O menu de contexto preenche com qualquer perfil |
| **Resultado do preenchimento** | Mostra o que foi preenchido e o que ficou de fora, e destaca os campos na página |
| **Backup** | Exporte e importe perfis num arquivo criptografado |
| **Idiomas** | Português e inglês |

## Instalação (desenvolvimento)

1. Clone o repositório.
2. Abra `chrome://extensions/` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto.

Não há etapa de build: a extensão roda direto do código-fonte.

## Uso

1. Clique no ícone › aba **Perfil** e preencha seus dados. Tudo salva sozinho.
2. Em um site com formulário, clique em **Preencher agora** ou use `Alt+Shift+F`.
3. Para salvar senhas, crie uma **senha mestra** em **Ajustes › Segurança**.
4. Para preencher automaticamente ao abrir um site, ligue **Auto-preencher neste site** na aba **Preencher**.

O atalho pode ser alterado em `chrome://extensions/shortcuts`.

## Atualizando da 1.x

Na primeira execução, os perfis 1 e 2 são migrados automaticamente. O campo "Endereço" passa a ser "Endereço (rua)". Senhas antigas, que eram salvas em texto puro, ficam pendentes até você criar uma senha mestra ou descartá-las. Um aviso aparece no popup. O auto-preenchimento global deixou de existir e agora é ativado por site.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npm run lint        # ESLint
npm run test:unit   # node:test — validação, migração, cofre, criptografia
npm run test:e2e    # Playwright — content script em páginas de teste (React, máscaras, Shadow DOM…)
npm run package     # gera dist/fifi-filler-<versão>.zip para a Chrome Web Store
```

O CI (GitHub Actions) roda lint e testes em cada push e gera o `.zip`. Ao criar uma tag `v*`, o `.zip` é anexado ao release.

## Estrutura

```
manifest.json      MV3: permissões mínimas, atalho, menu de contexto
background.js      service worker: orquestra o preenchimento, menus, auto-preenchimento por site
content.js         detecção e preenchimento (injetado sob demanda)
autofill.js        registrado só nos sites com auto-preenchimento ativo
popup.html/css/js  interface (também abre em página inteira: popup.html?page=1)
options.html/js    atalho para as configurações em página inteira
lib/br.js          CPF, CEP, datas, telefone, UFs
lib/fields.js      esquema do perfil e regras de detecção
lib/fake.js        gerador de dados de teste
lib/crypto.js      AES-GCM + PBKDF2 (WebCrypto)
lib/store.js       armazenamento, migração, cofre, payloads
_locales/          pt_BR e en
tests/             unitários e e2e
```

## Privacidade

Tudo fica no seu navegador. Veja [PRIVACY.md](PRIVACY.md).

## Licença

MIT
