# Política de Privacidade — Fifi-Filler

_Última atualização: 4 de novembro de 2026_

O Fifi-Filler preenche formulários com dados que **você** digita na extensão. Ele não tem servidor próprio, não usa analytics e não vende nem compartilha dados.

## Dados armazenados

- **Perfis** (nome, CPF, e-mail, telefone, endereço, dados de estudante, campos personalizados): ficam em `chrome.storage.local`, só no seu navegador.
- **Senhas**: são salvas **somente criptografadas** (AES-256-GCM, chave derivada da sua senha mestra via PBKDF2-SHA256, 310.000 iterações). A senha mestra nunca é gravada. Enquanto o cofre está desbloqueado, a chave fica em `chrome.storage.session`, que vive só na memória e some quando o navegador fecha.
- **Regras por site**: os sites onde você ligou o auto-preenchimento e os campos que você mapeou (seletores CSS).
- **Backups** exportados são criptografados com a senha de backup que você escolher.

## Comunicação externa

- **ViaCEP** (`viacep.com.br`): quando você busca um CEP, só o CEP é enviado, para obter o endereço. Nada mais é enviado.
- **Sites que você preenche**: os dados vão para os campos da página quando você manda preencher, ou quando você ativou o auto-preenchimento naquele site. O que o site faz com eles depende da política do próprio site.

## Permissões

| Permissão | Por quê |
|---|---|
| `storage` | Guardar perfis e configurações localmente |
| `activeTab`, `scripting` | Preencher a aba atual quando você clica, usa o atalho ou o menu de contexto |
| `contextMenus` | Menu de clique direito (preencher, mapear campo) |
| `https://viacep.com.br/*` | Buscar endereço pelo CEP |
| Acesso opcional a sites | Pedido **por site**, só quando você liga "Auto-preencher neste site". Pode ser revogado a qualquer momento |

## Remoção

Desinstalar a extensão apaga todos os dados. Você também pode apagar perfis, sites e o cofre na aba **Ajustes**.

## Contato

Abra uma issue em https://github.com/raphaeljdev/fifi-filler/issues.
