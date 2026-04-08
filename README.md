# 🧩 Fifi-Filler

> Extensão do Google Chrome que preenche automaticamente formulários de cadastro e checkout com suas informações pessoais — com suporte a dois perfis independentes.

![Version](https://img.shields.io/badge/versão-1.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-v3-green)
![Chrome](https://img.shields.io/badge/Google%20Chrome-suportado-yellow?logo=google-chrome)
![License](https://img.shields.io/badge/licença-MIT-lightgrey)

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Campos Suportados](#-campos-suportados)
- [Instalação](#-instalação)
- [Como Usar](#-como-usar)
- [Perfis](#-perfis)
- [Preenchimento Automático](#-preenchimento-automático)
- [Detecção de Formulários](#-detecção-de-formulários)
- [Dicas e Boas Práticas](#-dicas-e-boas-práticas)
- [FAQ](#-faq)
- [Estrutura do Projeto](#-estrutura-do-projeto)

---

## 🔍 Visão Geral

O **Fifi-Filler** é uma extensão local para o Google Chrome que detecta campos de formulário em qualquer site e os preenche automaticamente com as informações salvas em seu perfil. Ideal para quem precisa se cadastrar em múltiplos sites com frequência, economizando tempo e evitando erros de digitação.

---

## ✨ Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| ⚡ Preenchimento manual | Preenche os campos do site com um clique |
| 🤖 Preenchimento automático | Preenche ao abrir a página automaticamente |
| 👤 Dois perfis independentes | Alterne entre Perfil 1 e Perfil 2 |
| 💾 Dados salvos localmente | Tudo fica no seu navegador, sem servidores externos |
| 🔍 Detecção de formulários | Indica se a página atual possui formulários detectáveis |
| 🔒 Senha com toggle | Campo de senha com botão de mostrar/ocultar |
| 🗑️ Limpeza rápida | Limpa todos os campos do perfil ativo com um clique |
| 🎭 Suporte a campos mascarados | Preenche CPF, telefone e datas com máscara automaticamente |

---

## 📝 Campos Suportados

O Fifi-Filler reconhece e preenche os seguintes tipos de campo:

| Campo | Identificadores reconhecidos |
|---|---|
| **Primeiro nome** | firstName, nome, fname, given-name |
| **Sobrenome** | lastName, sobrenome, surname, family-name |
| **E-mail** | email, e-mail, mail |
| **Telefone** | phone, mobile, telephone, cel, cellphone, tel |
| **Senha** | password, senha, pass, pwd, passwd |
| **Endereço** | address, street, addr, endereco |
| **Cidade** | city, town, cidade |
| **Estado** | state, estado, province, region |
| **CEP** | zip, postal, postcode, cep |
| **CPF** | cpf, document, documento, documentNumber |
| **Data de nascimento** | dateOfBirth, nascimento, birthdate, dob |
| **CIE (ID estudantil)** | cie, student id, id estudante |
| **Data de validade** | validityDate, validade, expiracao, expiry |
| **Instituição** | institutionName, instituicao, escola, universidade |
| **Curso** | course, curso, degree |

> 💡 O Fifi-Filler também verifica atributos `aria-label`, `autocomplete`, `data-testid`, `data-field`, rótulos (`<label>`) associados e mais para aumentar a compatibilidade com diferentes sites.

---

## 🚀 Instalação

Como esta é uma extensão **local** (não publicada na Chrome Web Store), a instalação é feita pelo **Modo Desenvolvedor** do Chrome. Siga os passos abaixo:

### Passo 1 — Baixar os arquivos

Faça o download ou extraia o conteúdo do arquivo `fifi-filler.zip` em uma pasta de sua preferência.

```
📁 fifi-filler/
├── manifest.json
├── content.js
├── popup.js
├── popup.html
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

> ⚠️ Mantenha todos os arquivos juntos na mesma pasta. Não mova ou renomeie arquivos individualmente.

---

### Passo 2 — Abrir o Gerenciador de Extensões

1. Abra o **Google Chrome**
2. Na barra de endereço, digite e pressione **Enter**:
   ```
   chrome://extensions
   ```

---

### Passo 3 — Ativar o Modo Desenvolvedor

No canto superior direito da página de extensões, ative a chave **"Modo do desenvolvedor"** (Developer mode).

![Developer Mode toggle no canto superior direito]

---

### Passo 4 — Carregar a extensão

1. Clique no botão **"Carregar sem compactação"** (Load unpacked)
2. Navegue até a pasta `fifi-filler/` que você extraiu no Passo 1
3. Selecione a **pasta** (não um arquivo individual) e clique em **"Selecionar pasta"**

---

### Passo 5 — Confirmar instalação

A extensão **Fifi-Filler** deve aparecer na lista com seu ícone. Para facilitar o acesso:

1. Clique no ícone de **quebra-cabeça** 🧩 na barra de ferramentas do Chrome
2. Clique no ícone de **fixar** 📌 ao lado de "Fifi-Filler"

A extensão agora aparecerá diretamente na sua barra de ferramentas. ✅

---

## 🖱️ Como Usar

### 1. Abrir o popup

Clique no ícone do **Fifi-Filler** na barra de ferramentas do Chrome para abrir o painel.

### 2. Preencher seus dados

Preencha os campos do formulário no popup com suas informações pessoais (nome, e-mail, CPF, etc.).

### 3. Salvar

Clique em **"Salvar"** para armazenar os dados no perfil ativo. Os dados ficam salvos no armazenamento local do Chrome.

### 4. Preencher um formulário

Navegue até o site desejado, abra o popup do Fifi-Filler e clique em **"Preencher Agora"**.

O Fifi-Filler irá detectar automaticamente os campos do formulário e preenchê-los com as informações salvas.

### Botões do Popup

| Botão | Ação |
|---|---|
| **Salvar** | Salva os dados do perfil ativo no armazenamento local |
| **Preencher Agora** | Preenche o formulário da página atual imediatamente |
| **Limpar** | Apaga todos os campos do perfil ativo (localmente) |
| **👁️ / 🙈** | Alterna visibilidade do campo de senha |

---

## 👤 Perfis

O Fifi-Filler suporta **dois perfis independentes**, permitindo que você alterne entre diferentes conjuntos de dados (ex: uso pessoal e profissional).

### Alternar entre perfis

Use os botões **"Perfil 1"** e **"Perfil 2"** no topo do popup. Ao trocar de perfil:

- Os dados do perfil atual são **salvos automaticamente**
- Os dados do novo perfil são **carregados automaticamente**
- Uma mensagem de confirmação aparece na tela

> 💡 Os dados de cada perfil são armazenados de forma completamente independente — alterar um perfil não afeta o outro.

---

## 🤖 Preenchimento Automático

Ative a opção **"Preencher automaticamente ao abrir páginas"** para que o Fifi-Filler preencha os formulários automaticamente toda vez que você abrir um site com formulários detectáveis.

> ⚠️ **Atenção:** O preenchimento automático ocorre **1,5 segundo** após o carregamento da página. Isso é intencional para aguardar que formulários dinâmicos (carregados via JavaScript) sejam renderizados.

### Salvar ao preencher

Ative a opção **"Salvar ao preencher"** para que os dados do popup sejam automaticamente salvos no perfil toda vez que você clicar em "Preencher Agora".

---

## 🔍 Detecção de Formulários

O popup exibe um **indicador de status** que informa se a página atual possui formulários detectáveis:

| Status | Significado |
|---|---|
| 🟢 **Website detectado ✓** | A página possui campos de formulário compatíveis |
| 🟡 **Nenhum formulário encontrado** | A página não possui campos detectáveis |
| ⚪ **Nenhuma página detectada** | O popup foi aberto em uma página interna do Chrome |

---

## 💡 Dicas e Boas Práticas

- **Telefone e CPF com máscara:** Digite apenas os números (ex: `11999998888`). O Fifi-Filler cuida da formatação automaticamente ao preencher.
- **Sites com frameworks modernos (React, Angular, Vue):** O Fifi-Filler simula a digitação real e dispara eventos de forma compatível com esses frameworks.
- **Senha:** Use com cuidado. O campo de senha é preenchido somente em campos do tipo `password`. Não é recomendado salvar senhas de alta importância aqui.
- **Campos não preenchidos:** Se um campo do site não for reconhecido, tente verificar se o atributo `name`, `id`, ou `placeholder` do campo corresponde a algum dos padrões suportados.
- **Extensão desatualizada:** Se o Chrome indicar que a extensão precisa ser recarregada após uma atualização dos arquivos, vá em `chrome://extensions` e clique em **"Recarregar"** na extensão.

---

## ❓ FAQ

**Por que a extensão não preenche algum campo?**
> O Fifi-Filler pode não reconhecer campos com nomes muito proprietários ou incomuns. Certifique-se de que o campo possui atributos de identificação padrão (`name`, `id`, `placeholder`, `aria-label`).

**Meus dados são enviados para algum servidor?**
> Não. Todos os dados são armazenados exclusivamente no armazenamento local do seu Chrome (`chrome.storage.local`) e nunca saem do seu navegador.

**A extensão funciona em modo anônimo?**
> Por padrão, não. Para habilitar, vá em `chrome://extensions`, clique em "Detalhes" no Fifi-Filler e ative **"Permitir no modo anônimo"**. Note que os dados salvos não estão disponíveis em abas anônimas a menos que sejam re-inseridos.

**O que acontece se eu atualizar os arquivos da extensão?**
> Vá em `chrome://extensions` e clique no ícone de **recarregar** (🔄) abaixo da extensão para aplicar as alterações.

**Posso ter mais de dois perfis?**
> Na versão atual (1.0.0), apenas dois perfis são suportados. Suporte a perfis adicionais pode ser adicionado em versões futuras.

---

## 📁 Estrutura do Projeto

```
fifi-filler/
│
├── manifest.json        # Configuração da extensão (Manifest v3)
├── popup.html           # Interface do usuário (popup)
├── popup.js             # Lógica do popup: perfis, salvar, preencher, toggles
├── content.js           # Script injetado nas páginas: detecta e preenche campos
│
└── icons/
    ├── icon16.png       # Ícone 16×16 px (barra de endereço)
    ├── icon48.png       # Ícone 48×48 px (gerenciador de extensões)
    └── icon128.png      # Ícone 128×128 px (Chrome Web Store / detalhes)
```

### Fluxo de funcionamento

```
Usuário clica "Preencher Agora"
        │
        ▼
  popup.js coleta dados
  do formulário do popup
        │
        ▼
  Envia mensagem via
  chrome.tabs.sendMessage()
        │
        ▼
  content.js recebe a mensagem
  e percorre FIELD_MAP
        │
        ▼
  Para cada campo:
  findField() → fillField()
  (simula digitação real)
        │
        ▼
  Retorna contagem de campos
  preenchidos ao popup
```

---

## 📄 Licença

Este projeto é de uso pessoal e distribuído sob a licença **MIT**.

---

> Feito com ❤️ — Fifi-Filler v1.0.0
