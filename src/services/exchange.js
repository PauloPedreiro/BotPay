import { db } from '../db.js';

const EXCHANGE_API_URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
const RETRY_INTERVAL_MS = 1 * 60 * 60 * 1000;  // 1 hora em caso de erro

export async function updateExchangeRate() {
  try {
    console.log('[Cambio] Atualizando cotação de USD/BRL...');
    const response = await fetch(EXCHANGE_API_URL);
    if (!response.ok) {
      throw new Error(`Resposta da API inválida: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.USDBRL || !data.USDBRL.bid) {
      throw new Error('Formato de resposta inesperado da AwesomeAPI');
    }
    
    const rate = parseFloat(data.USDBRL.bid);
    if (isNaN(rate) || rate <= 0) {
      throw new Error(`Taxa de câmbio inválida convertida: ${rate}`);
    }

    db.setConfig('usd_brl_rate', rate);
    db.setConfig('usd_brl_last_updated', Date.now());
    console.log(`[Cambio] Cotação atualizada com sucesso! USD/BRL = R$ ${rate.toFixed(4)}`);
    
    // Atualizar o painel fixo no Discord (importação dinâmica para evitar dependências circulares)
    try {
      const { updateMainPanel } = await import('../bot.js');
      await updateMainPanel();
    } catch (panelErr) {
      // O bot pode ainda não estar pronto/logado na inicialização
    }
    
    return rate;
  } catch (err) {
    console.error(`[Cambio] Erro ao buscar taxa de câmbio: ${err.message}`);
    console.log('[Cambio] Utilizando cotação existente do banco de dados.');
    return db.getConfig('usd_brl_rate', 5.0);
  }
}

export function initExchangeService() {
  // Executa uma vez na inicialização
  updateExchangeRate();

  // Configura a rotina periódica
  setInterval(async () => {
    const lastUpdated = db.getConfig('usd_brl_last_updated', 0);
    const now = Date.now();
    
    // Verifica se realmente se passaram 24 horas
    if (now - lastUpdated >= UPDATE_INTERVAL_MS) {
      await updateExchangeRate();
    }
  }, RETRY_INTERVAL_MS); // Roda a checagem a cada 1 hora para re-tentar se falhou
}
