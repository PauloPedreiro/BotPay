import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.json');
const tmpPath = path.join(process.cwd(), 'database.tmp');

// Estado em memória cache
let dbState = {
  donations: [],
  config: {
    usd_brl_rate: 5.0,
    usd_brl_last_updated: 0,
    donation_goal_brl: 2500
  }
};

// Carrega os dados do banco de dados na inicialização
function loadDatabase() {
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      dbState = JSON.parse(data);
      // Garantir integridade da estrutura
      if (!dbState.donations) dbState.donations = [];
      if (!dbState.config) dbState.config = {};
    } catch (err) {
      console.error('Erro ao ler database.json, inicializando com banco vazio:', err.message);
    }
  } else {
    saveDatabase();
  }
}

// Salva os dados no disco de forma segura (escreve no temp e renomeia)
function saveDatabase() {
  try {
    const dataStr = JSON.stringify(dbState, null, 2);
    fs.writeFileSync(tmpPath, dataStr, 'utf8');
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('Erro ao salvar no banco de dados:', err);
  }
}

// Inicializar banco
loadDatabase();

export const db = {
  // Retorna todas as doações
  getDonations() {
    return dbState.donations;
  },

  // Busca doação por ID ou ID do gateway (faz conversão para string para evitar erros de tipo numérico vs string)
  getDonation(id) {
    if (!id) return null;
    const searchId = String(id);
    return dbState.donations.find(d => 
      String(d.id) === searchId || 
      (d.payment_id && String(d.payment_id) === searchId)
    );
  },

  // Adiciona uma nova doação
  addDonation(donation) {
    const newDonation = {
      id: donation.id || `don_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: donation.user_id,
      username: donation.username,
      email: donation.email,
      amount: parseFloat(donation.amount),
      currency: donation.currency.toUpperCase(), // 'BRL' ou 'USD'
      gateway: donation.gateway, // 'mercadopago' ou 'stripe'
      payment_id: donation.payment_id || null, // ID gerado pelo gateway
      status: donation.status || 'pending', // 'pending', 'approved', 'failed'
      channel_id: donation.channel_id || null,
      created_at: donation.created_at || Date.now(),
      updated_at: Date.now()
    };
    dbState.donations.push(newDonation);
    saveDatabase();
    return newDonation;
  },

  // Atualiza uma doação existente
  updateDonation(id, updates) {
    if (!id) return null;
    const searchId = String(id);
    const index = dbState.donations.findIndex(d => 
      String(d.id) === searchId || 
      (d.payment_id && String(d.payment_id) === searchId)
    );
    if (index !== -1) {
      dbState.donations[index] = {
        ...dbState.donations[index],
        ...updates,
        updated_at: Date.now()
      };
      saveDatabase();
      return dbState.donations[index];
    }
    return null;
  },

  // Configurações chave-valor
  getConfig(key, defaultValue = null) {
    return dbState.config[key] !== undefined ? dbState.config[key] : defaultValue;
  },

  setConfig(key, value) {
    dbState.config[key] = value;
    saveDatabase();
  },

  // Obter totais acumulados convertidos para BRL
  getTotals(exchangeRate = null) {
    const rate = exchangeRate || this.getConfig('usd_brl_rate', 5.0);
    let totalBRL = 0;
    let totalUSD = 0;

    const approvedDonations = dbState.donations.filter(d => d.status === 'approved');

    for (const d of approvedDonations) {
      if (d.currency === 'BRL') {
        totalBRL += d.amount;
        totalUSD += d.amount / rate;
      } else if (d.currency === 'USD') {
        totalUSD += d.amount;
        totalBRL += d.amount * rate;
      }
    }

    return {
      brl: totalBRL,
      usd: totalUSD,
      exchangeRate: rate
    };
  }
};
