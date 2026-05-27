# 💖 BotPay - Sistema de Doações para Discord

Bot de doações completo para servidores de Discord com suporte nativo a **Mercado Pago (PIX)**, **Stripe (Cartão de Crédito)**, localização bilíngue (Português/Inglês) e painel administrativo integrado.

<p align="center">
  <img src="imagens/BotPayFaixa.png" alt="BotPay Banner" width="55%" />
  <img src="imagens/BotPay.png" alt="BotPay Logo" width="35%" />
</p>

---

## 📸 Capturas de Tela

<p align="center">
  <img src="imagens/image1.png" alt="Painel de Metas" width="48%" />
  <img src="imagens/image.png" alt="Seleção de Valores (Ticket)" width="48%" />
</p>

---

## 🚀 Funcionalidades Principais

*   **⚡ Pagamentos Automatizados:**
    *   **Mercado Pago (PIX):** Geração automática de QR Code e código copia e cola direto no Discord, com webhook dinâmico sem necessidade de configuração manual.
    *   **Stripe (Cartão):** Links de checkout inteligentes. Detecta a nacionalidade do usuário e cobra em **Reais (BRL)** para brasileiros (evitando recusa de cartões nacionais como Elo) e em **Dólares (USD)** com cotação automática para estrangeiros.
*   **🌐 Localização Bilíngue Dinâmica:**
    *   O bot detecta o idioma preferido do usuário com base em cargos específicos no Discord (Cargos PT/US) ou na linguagem padrão do cliente do usuário.
    *   Toda a interface de tickets, DMs de agradecimento, recibos e alertas acompanham o idioma escolhido.
*   **📊 Painel de Metas Público:**
    *   Mensagem fixa atualizada em tempo real que exibe o progresso de metas de doação mensais em barras de progresso visuais.
*   **🛡️ Painel Administrativo de Logs & Aprovação Rápida:**
    *   Sempre que um usuário inicia uma intenção de pagamento, um log detalhado é enviado ao canal da administração.
    *   Inclui um botão interativo `✅ Aprovar Pagamento` que permite a um administrador aprovar manualmente a doação com um clique (atualizando metas, DMs e entregando o cargo VIP).
*   **🔧 Infraestrutura Autogerenciada:**
    *   Instalação silenciosa do executável do Ngrok caso não seja detectado na máquina.
    *   Atualização automática silenciosa do Ngrok na inicialização para evitar quedas e erros de versão obsoleta (`ERR_NGROK_121`).

---

## 🛠️ Guia de Configuração (`config.json`)

Edite o arquivo `config.json` na raiz da pasta do bot com as seguintes configurações:

```json
{
  "DISCORD_TOKEN": "SEU_TOKEN_DO_BOT_DISCORD",
  "DISCORD_CLIENT_ID": "ID_DO_SEU_BOT_NO_PORTAL_DEVELOPER",
  "MERCADOPAGO_ACCESS_TOKEN": "SEU_TOKEN_MERCADO_PAGO",
  "STRIPE_SECRET_KEY": "SUA_CHAVE_SECRETA_STRIPE_LIVE_OU_TEST",
  "STRIPE_WEBHOOK_SECRET": "SEU_SEGREDO_DE_WEBHOOK_STRIPE",
  "PORT": 3000,
  "BASE_URL": "http://localhost:3000",
  "NGROK_AUTHTOKEN": "SEU_AUTHTOKEN_DO_NGROK",
  "DONATION_CHANNEL_ID": "ID_DO_CANAL_DE_DOACAO_ONDE_FICA_O_PAINEL",
  "VIP_ROLE_ID": "ID_DO_CARGO_VIP_ENTREGUE_AO_DOAR",
  "LOG_CHANNEL_ID": "ID_DO_CANAL_DE_LOGS_E_APROVACOES",
  "DONATION_GOAL_BRL": 2500,
  "PREDEFINED_VALUES_BRL": [10, 25, 50, 100],
  "PANEL_TITLE": "💖 Apoie o Projeto / Support the Project",
  "PANEL_DESC_PT": "Ajude a liberar o Scum Server Manager completo com RCON e Open Source no GitHub.\n🏆 Cargo especial no Discord.",
  "PANEL_DESC_EN": "Help release the full Scum Server Manager with RCON and Open Source on GitHub.\n🏆 Special Discord role.",
  "PANEL_META_TITLE": "📊 **Status da Meta / Goal Status:**",
  "PANEL_BRL_LABEL": "🇧🇷 **Real (BRL):**",
  "PANEL_USD_LABEL": "🇺🇸 **Dólar (USD):**",
  "PANEL_EXCHANGE_LABEL": "💱 *Cotação / Exchange Rate:*",
  "PANEL_FOOTER": "Clique no botão abaixo para iniciar / Click below to start",
  "ROLE_ENGLISH_ID": "ID_DO_CARGO_DE_IDIOMA_INGLES",
  "ROLE_PORTUGUESE_ID": "ID_DO_CARGO_DE_IDIOMA_PORTUGUES"
}
```

---

## 📦 Como Compilar e Rodar

### 💻 Opção A: Executável Portátil (`.exe`) - Recomendado para Servidores
Esta opção não exige Node.js, NPM ou pasta `node_modules` no servidor. Tudo é embutido no executável.

1. **Na máquina de desenvolvimento:**
   * Execute o comando para compilar:
     ```bash
     npm run build
     ```
   * Isso gerará o arquivo `botpay.exe` dentro da pasta `dist/`.
2. **No Servidor de Produção:**
   * Copie apenas os arquivos `dist/botpay.exe` e `config.json` para a mesma pasta.
   * Dê dois cliques em `botpay.exe`.
   * O bot instalará o Ngrok (caso não tenha), configurará o túnel e ligará tudo de forma 100% independente!

### ⚙️ Opção B: Rodando com Node.js diretamente
Requer Node.js instalado na máquina.

1. Instale as dependências:
   ```bash
   npm install --omit=dev
   ```
2. Inicialize o bot:
   ```bash
   npm start
   ```

---

## 🎯 Comandos Slash Disponíveis

*   `/setup` - Cria o painel fixo de doação e progresso de metas no canal configurado.
*   `/meta` - Exibe a meta atual de doações de forma interativa.
*   `/setmeta <valor>` - Permite alterar o valor da meta de doações mensal em tempo real.
*   `/aprovar-doacao <id>` - Comando administrativo para aprovar manualmente uma doação pendente (caso precise resgatar algum pagamento manual fora do bot).
