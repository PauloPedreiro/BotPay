import Stripe from 'stripe';
import config from '../config.js';
import { db } from '../db.js';

let stripe = null;

function getStripeInstance() {
  if (!stripe) {
    stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' // Versão estável
    });
  }
  return stripe;
}

export async function createStripeSession({ amountBrl, email, userId, username, donationId, isPt }) {
  try {
    const stripeInstance = getStripeInstance();
    
    // Obter cotação atual do USD/BRL
    const rate = db.getConfig('usd_brl_rate', 5.0);
    
    // Determinar a moeda e o valor com base na localização do usuário
    const currency = isPt ? 'brl' : 'usd';
    const amountInCents = isPt 
      ? Math.round(amountBrl * 100) 
      : Math.round((amountBrl / rate) * 100);

    const amountUsd = amountBrl / rate;
    
    if (!isPt && amountInCents < 50) {
      // Stripe tem um mínimo de $0.50 USD por cobrança
      throw new Error('O valor convertido em USD é muito baixo. O mínimo para cartão é $0.50 USD (aprox. R$ 2.50).');
    }

    console.log(`[Stripe] Criando checkout session de R$ ${amountBrl} (${isPt ? 'BRL' : `≈ $${amountUsd.toFixed(2)} USD`}) para @${username}...`);

    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: isPt ? 'Doação para o Servidor' : 'Donation to the Server',
              description: isPt 
                ? `Apoio de @${username}` 
                : `Support from @${username} (Equivalent to R$ ${amountBrl.toFixed(2)})`
            },
            unit_amount: amountInCents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      metadata: {
        donation_id: donationId,
        discord_user_id: userId,
        discord_username: username,
        amount_brl: amountBrl.toString(),
        amount_usd: amountUsd.toString(),
        is_pt: isPt ? 'true' : 'false'
      },
      success_url: `${config.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.BASE_URL}/cancel`
    });

    return {
      sessionId: session.id,
      url: session.url
    };
  } catch (err) {
    console.error('[Stripe] Erro ao criar checkout session:', err.message);
    throw err;
  }
}

export async function verifyStripeSession(sessionId) {
  try {
    const stripeInstance = getStripeInstance();
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);
    return {
      status: session.payment_status, // 'paid', 'unpaid', etc.
      metadata: session.metadata
    };
  } catch (err) {
    console.error(`[Stripe] Erro ao verificar session ${sessionId}:`, err.message);
    throw err;
  }
}
