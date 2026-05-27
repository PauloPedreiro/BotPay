import express from 'express';
import Stripe from 'stripe';
import config from './config.js';
import { db } from './db.js';
import { getPaymentStatus } from './gateways/mercadopago.js';
import { notifyApprovedPayment } from './bot.js';

const app = express();

// Middleware global para JSON (exceto para o webhook da Stripe que precisa de body bruto)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhooks/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// 1. Webhook da Stripe
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripe = new Stripe(config.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[Stripe Webhook] Erro de assinatura: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Trata o evento de pagamento concluído
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const donationId = session.metadata.donation_id;
    
    console.log(`[Stripe Webhook] Sessão de checkout concluída para doação ID: ${donationId}`);

    if (session.payment_status === 'paid') {
      const donation = db.getDonation(donationId);
      if (donation && donation.status !== 'approved') {
        db.updateDonation(donation.id, {
          status: 'approved',
          payment_id: session.id
        });
        await notifyApprovedPayment(donation.id);
      }
    }
  }

  res.json({ received: true });
});

// 2. Webhook do Mercado Pago
app.post('/webhooks/mercadopago', async (req, res) => {
  try {
    // Mercado Pago pode enviar a ID via query ou no body dependendo da versão
    const paymentId = req.query.id || req.body?.data?.id || req.body?.id;
    const action = req.body?.action || req.query.topic;

    if (!paymentId) {
      return res.status(400).json({ error: 'Nenhum payment ID fornecido.' });
    }

    console.log(`[MercadoPago Webhook] Notificação recebida: ID ${paymentId}, Ação: ${action}`);

    // Consultar o status direto da API do Mercado Pago por segurança
    const paymentInfo = await getPaymentStatus(paymentId);
    
    if (paymentInfo.status === 'approved') {
      // Procurar a doação correspondente no banco
      const donation = db.getDonation(paymentId);
      if (donation && donation.status !== 'approved') {
        db.updateDonation(donation.id, { status: 'approved' });
        await notifyApprovedPayment(donation.id);
        console.log(`[MercadoPago Webhook] Doação ID ${donation.id} aprovada via webhook.`);
      } else if (!donation) {
        console.log(`[MercadoPago Webhook] Pagamento ${paymentId} aprovado, mas não encontrado no banco local.`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[MercadoPago Webhook] Erro ao processar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Página de Sucesso (Stripe Checkout)
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Doação Confirmada - Obrigado!</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Outfit', sans-serif;
          background: radial-gradient(circle at center, #1a1025 0%, #0d0614 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          overflow: hidden;
        }
        .container {
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 3rem 2rem;
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          max-width: 480px;
          width: 90%;
          animation: scaleUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .icon-box {
          position: relative;
          width: 100px;
          height: 100px;
          margin: 0 auto 2rem;
        }
        .circle {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #00ff7f 0%, #00b359 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(0, 255, 127, 0.4);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 255, 127, 0.6); }
          70% { box-shadow: 0 0 0 20px rgba(0, 255, 127, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 255, 127, 0); }
        }
        .icon-box svg {
          width: 50px;
          height: 50px;
          fill: none;
          stroke: white;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 80;
          stroke-dashoffset: 80;
          animation: drawCheck 0.8s 0.3s ease-in-out forwards;
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        h1 {
          font-weight: 800;
          font-size: 2.2rem;
          background: linear-gradient(135deg, #ffffff 0%, #a5a5a5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 1rem;
        }
        p {
          font-size: 1.1rem;
          color: #b5b3b8;
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #ff007f 0%, #7f00ff 100%);
          border: none;
          color: white;
          padding: 1rem 2.5rem;
          font-size: 1rem;
          font-weight: 600;
          border-radius: 50px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s ease;
          box-shadow: 0 10px 25px rgba(255, 0, 127, 0.3);
        }
        .btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 15px 30px rgba(255, 0, 127, 0.5);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon-box">
          <div class="circle">
            <svg viewBox="0 0 52 52">
              <path d="M14 27 l10 10 l20 -20"/>
            </svg>
          </div>
        </div>
        <h1>Doação Confirmada!</h1>
        <p>Agradecemos imensamente o seu apoio. Suas vantagens VIP no Discord já foram liberadas!</p>
        <a href="discord://open" class="btn">Voltar para o Discord</a>
      </div>
    </body>
    </html>
  `);
});

// 4. Página de Cancelamento (Stripe Checkout)
app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Doação Cancelada</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Outfit', sans-serif;
          background: radial-gradient(circle at center, #251010 0%, #140606 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 3rem 2rem;
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          max-width: 480px;
          width: 90%;
          animation: scaleUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .circle {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #ff3b30 0%, #ff2d55 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
          box-shadow: 0 0 30px rgba(255, 59, 48, 0.4);
        }
        .circle svg {
          width: 45px;
          height: 45px;
          fill: none;
          stroke: white;
          stroke-width: 5;
          stroke-linecap: round;
        }
        h1 {
          font-weight: 800;
          font-size: 2.2rem;
          background: linear-gradient(135deg, #ffffff 0%, #a5a5a5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 1rem;
        }
        p {
          font-size: 1.1rem;
          color: #b5b3b8;
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        .btn {
          display: inline-block;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 1rem 2.5rem;
          font-size: 1rem;
          font-weight: 600;
          border-radius: 50px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s ease;
        }
        .btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="circle">
          <svg viewBox="0 0 52 52">
            <line x1="15" y1="15" x2="37" y2="37" />
            <line x1="15" y1="37" x2="37" y2="15" />
          </svg>
        </div>
        <h1>Pagamento Cancelado</h1>
        <p>A transação de doação foi cancelada. Nenhum valor foi cobrado do seu cartão de crédito.</p>
        <a href="discord://open" class="btn">Voltar para o Discord</a>
      </div>
    </body>
    </html>
  `);
});

// Inicialização do Servidor Express
export function initServer() {
  const PORT = config.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Express] Servidor web rodando na porta ${PORT}`);
    console.log(`[Express] URL Base configurada: ${config.BASE_URL}`);
  });
}
