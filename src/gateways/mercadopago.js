import config from '../config.js';
import QRCode from 'qrcode';

const MP_BASE_URL = 'https://api.mercadopago.com/v1';

export async function generateQrCodeBuffer(text) {
  try {
    return await QRCode.toBuffer(text, {
      margin: 2,
      width: 350
    });
  } catch (err) {
    console.error('[MercadoPago] Erro ao gerar buffer do QR Code:', err.message);
    throw err;
  }
}

export async function createPixPayment({ amount, email, cpf, description, userId, username }) {
  try {
    const url = `${MP_BASE_URL}/payments`;
    
    // UUID aleatório simples para chave de idempotência
    const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const payer = {
      email: email,
      first_name: username || 'Doador',
      last_name: 'Discord'
    };

    // Mercado Pago exige CPF para pagamentos PIX
    if (cpf) {
      // Limpa pontuações do CPF
      const cleanCpf = cpf.replace(/\D/g, '');
      if (cleanCpf.length === 11) {
        payer.identification = {
          type: 'CPF',
          number: cleanCpf
        };
      }
    }

    const body = {
      transaction_amount: parseFloat(amount),
      description: description || `Doação Discord - @${username}`,
      payment_method_id: 'pix',
      payer: payer,
      metadata: {
        discord_user_id: userId,
        discord_username: username
      }
    };

    if (config.BASE_URL && config.BASE_URL.startsWith('https://')) {
      body.notification_url = `${config.BASE_URL}/webhooks/mercadopago`;
    }

    console.log(`[MercadoPago] Criando PIX de R$ ${amount} para @${username}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[MercadoPago] Erro da API:', errorData);
      throw new Error(errorData.message || `Erro HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Extrai dados da transação PIX
    const transactionData = data.point_of_interaction?.transaction_data;
    if (!transactionData) {
      throw new Error('Retorno da transação PIX não contém dados do QR Code.');
    }

    return {
      paymentId: data.id.toString(),
      status: data.status, // 'pending', 'approved', etc.
      qrCode: transactionData.qr_code, // Copia e Cola
      qrCodeBase64: transactionData.qr_code_base64 // Base64 da imagem
    };
  } catch (err) {
    console.error('[MercadoPago] Erro ao criar pagamento:', err.message);
    throw err;
  }
}

export async function getPaymentStatus(paymentId) {
  try {
    const url = `${MP_BASE_URL}/payments/${paymentId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      paymentId: data.id.toString(),
      status: data.status, // 'pending', 'approved', 'rejected', etc.
      amount: data.transaction_amount,
      currency: data.currency_id,
      metadata: data.metadata
    };
  } catch (err) {
    console.error(`[MercadoPago] Erro ao consultar pagamento ${paymentId}:`, err.message);
    throw err;
  }
}
