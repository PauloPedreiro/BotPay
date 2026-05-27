import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config.json');
const examplePath = path.join(process.cwd(), 'config.example.json');

const defaultConfig = {
  DISCORD_TOKEN: "INSIRA_O_TOKEN_DO_BOT_AQUI",
  DISCORD_CLIENT_ID: "INSIRA_O_CLIENT_ID_DO_BOT_AQUI",
  MERCADOPAGO_ACCESS_TOKEN: "INSIRA_O_ACCESS_TOKEN_DO_MERCADO_PAGO_AQUI",
  STRIPE_SECRET_KEY: "INSIRA_A_SECRET_KEY_DA_STRIPE_AQUI",
  STRIPE_WEBHOOK_SECRET: "INSIRA_O_WEBHOOK_SECRET_DA_STRIPE_AQUI",
  PORT: 3000,
  BASE_URL: "http://localhost:3000",
  NGROK_AUTHTOKEN: "INSIRA_O_TOKEN_DO_NGROK_AQUI",
  DONATION_CHANNEL_ID: "INSIRA_O_ID_DO_CANAL_DE_DOACAO_AQUI",
  VIP_ROLE_ID: "INSIRA_O_ID_DO_CARGO_VIP_AQUI",
  LOG_CHANNEL_ID: "INSIRA_O_ID_DO_CANAL_DE_AGRADECIMENTO_AQUI",
  DONATION_GOAL_BRL: 2500,
  PREDEFINED_VALUES_BRL: [10, 25, 50, 100],
  PANEL_TITLE: "💖 Central de Apoio & Meta do Servidor / Server Goal",
  PANEL_DESC_PT: "Ajude-nos a manter o servidor online e com alto desempenho! As doações são voluntárias e todos os fundos arrecadados são reinvestidos em melhorias.\n🏆 *Vantagens:* Cargo especial de Doador no Discord e acesso a canais exclusivos.",
  PANEL_DESC_EN: "Help us keep the server online and performing at its best! Donations are voluntary and all funds are reinvested directly into server improvements.\n🏆 *Perks:* Special Discord role and access to exclusive VIP channels.",
  PANEL_META_TITLE: "📊 **Status da Meta Mensal / Monthly Goal Status:**",
  PANEL_BRL_LABEL: "🇧🇷 **Real (BRL):**",
  PANEL_USD_LABEL: "🇺🇸 **Dólar (USD):**",
  PANEL_EXCHANGE_LABEL: "💱 *Cotação / Exchange Rate:*",
  PANEL_FOOTER: "Clique no botão abaixo para iniciar / Click below to start",
  ROLE_ENGLISH_ID: "INSIRA_O_ID_DO_CARGO_INGLES_AQUI",
  ROLE_PORTUGUESE_ID: "INSIRA_O_ID_DO_CARGO_PORTUGUES_AQUI"
};

function initConfig() {
  if (!fs.existsSync(configPath)) {
    console.log('\x1b[33m%s\x1b[0m', '==================================================');
    console.log('\x1b[31m%s\x1b[0m', 'AVISO: Arquivo config.json não encontrado!');
    console.log('\x1b[32m%s\x1b[0m', 'Criando um novo arquivo config.json para você...');
    
    let configToWrite = defaultConfig;
    if (fs.existsSync(examplePath)) {
      try {
        const exampleData = fs.readFileSync(examplePath, 'utf8');
        configToWrite = JSON.parse(exampleData);
      } catch (err) {
        // Ignorar erro e usar o padrão
      }
    }
    
    fs.writeFileSync(configPath, JSON.stringify(configToWrite, null, 2), 'utf8');
    
    console.log('\x1b[32m%s\x1b[0m', 'Arquivo config.json criado com sucesso!');
    console.log('\x1b[33m%s\x1b[0m', 'Por favor, preencha as credenciais no config.json antes de iniciar o bot.');
    console.log('\x1b[33m%s\x1b[0m', '==================================================');
    process.exit(1);
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Validar se chaves padrões não foram alteradas
    const placeholders = [
      "INSIRA_O_TOKEN_DO_BOT_AQUI",
      "INSIRA_O_CLIENT_ID_DO_BOT_AQUI",
      "INSIRA_O_ACCESS_TOKEN_DO_MERCADO_PAGO_AQUI",
      "INSIRA_A_SECRET_KEY_DA_STRIPE_AQUI",
      "INSIRA_O_ID_DO_CANAL_DE_DOACAO_AQUI"
    ];

    const hasPlaceholders = Object.keys(config).some(key => 
      placeholders.includes(config[key])
    );

    if (hasPlaceholders) {
      console.log('\x1b[33m%s\x1b[0m', '==================================================');
      console.log('\x1b[31m%s\x1b[0m', 'ERRO: O config.json ainda contém valores de exemplo!');
      console.log('\x1b[33m%s\x1b[0m', 'Abra o arquivo config.json e configure os campos com seus tokens reais.');
      console.log('\x1b[33m%s\x1b[0m', '==================================================');
      process.exit(1);
    }

    return config;
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Erro ao ler ou processar o config.json:', err.message);
    process.exit(1);
  }
}

const config = initConfig();
export default config;
export function saveConfig(newConfig) {
  try {
    const merged = { ...config, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    Object.assign(config, merged);
    return true;
  } catch (err) {
    console.error('Erro ao salvar config.json:', err);
    return false;
  }
}
