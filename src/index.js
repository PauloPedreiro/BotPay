import config from './config.js'; // Executa a validação e criação do config.json primeiro!
import { initBot } from './bot.js';
import { initServer } from './server.js';
import { initExchangeService } from './services/exchange.js';
import { initNgrok } from './utils/ngrok.js';

async function main() {
  console.log('\x1b[35m%s\x1b[0m', '==================================================');
  console.log('\x1b[35m%s\x1b[0m', '      INICIANDO BOTPAY - SISTEMA DE DOAÇÕES       ');
  console.log('\x1b[35m%s\x1b[0m', '==================================================');

  try {
    // 0. Inicializar Túnel Ngrok se configurado no config.json
    await initNgrok();

    // 1. Inicializar Serviço de Câmbio (USD/BRL)
    initExchangeService();
    console.log('[Sistema] Serviço de câmbio inicializado.');

    // 2. Inicializar Servidor Express (Webhooks)
    initServer();
    console.log('[Sistema] Servidor Web Express inicializado.');

    // 3. Inicializar Bot do Discord
    await initBot();
    console.log('[Sistema] Bot do Discord conectado e ativo.');

    console.log('\x1b[32m%s\x1b[0m', '==================================================');
    console.log('\x1b[32m%s\x1b[0m', '  BOTPAY ESTÁ TOTALMENTE OPERACIONAL E RODANDO!   ');
    console.log('\x1b[32m%s\x1b[0m', '==================================================');
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Erro crítico durante a inicialização:', err);
    process.exit(1);
  }
}

main();
