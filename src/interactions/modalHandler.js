import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { db } from '../db.js';
import { getLocaleIsPt } from '../utils/language.js';
import { createPixPayment, generateQrCodeBuffer } from '../gateways/mercadopago.js';
import { createStripeSession } from '../gateways/stripe.js';

export async function handleModalInteraction(interaction) {
  const customId = interaction.customId;
  const isPt = getLocaleIsPt(interaction);
  const totals = db.getTotals();
  const exchangeRate = totals.exchangeRate;

  // 1. Recebeu valor customizado digitado
  if (customId === 'donate_modal_custom_value') {
    const amountStr = interaction.fields.getTextInputValue('amount').replace(',', '.').trim();
    const rawAmount = parseFloat(amountStr);

    if (isNaN(rawAmount) || rawAmount <= 0) {
      return await interaction.reply({ 
        content: isPt 
          ? 'Por favor, informe um valor válido maior que zero (ex: 20 ou 50.50).' 
          : 'Please provide a valid amount greater than zero (e.g. 10 or 25.50).',
        ephemeral: true
      });
    }

    // Se for internacional, converter o valor digitado em USD para BRL (Arredondado para centavos)
    const amountBrl = Math.round((isPt ? rawAmount : rawAmount * exchangeRate) * 100) / 100;
    const amountUsd = Math.round((isPt ? rawAmount / exchangeRate : rawAmount) * 100) / 100;

    const embed = new EmbedBuilder()
      .setTitle(isPt ? '🛒 Escolha a forma de pagamento' : '🛒 Choose Payment Method')
      .setDescription(
        isPt
          ? `Você selecionou doar **R$ ${amountBrl.toFixed(2)}**.\n\nEscolha como deseja pagar abaixo:`
          : `You selected to donate **$ ${amountUsd.toFixed(2)} USD**.\n\nChoose how you want to pay below:`
      )
      .setColor('#FF007F');

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`select_pay_pix_${amountBrl}`)
        .setLabel(isPt ? 'PIX (Mercado Pago)' : 'PIX (Brazil Only)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId(`select_pay_card_${amountBrl}`)
        .setLabel(isPt ? 'Cartão de Crédito (Stripe)' : 'Credit Card (Stripe)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💳')
    );

    return await interaction.reply({
      embeds: [embed],
      components: [buttons]
    });
  }

  // 2. Submissão do Modal do PIX (e-mail + CPF)
  if (customId.startsWith('donate_modal_pix_')) {
    await interaction.deferReply();
    const amountBrl = Math.round(parseFloat(customId.replace('donate_modal_pix_', '')) * 100) / 100;
    const email = interaction.fields.getTextInputValue('email').trim();
    const cpf = interaction.fields.getTextInputValue('cpf').trim();

    // Validação básica de e-mail
    if (!email.includes('@') || !email.includes('.')) {
      return await interaction.editReply({ 
        content: isPt 
          ? 'Por favor, informe um e-mail válido para receber o recibo.' 
          : 'Please provide a valid email so you can receive the receipt.' 
      });
    }

    if (cpf.replace(/\D/g, '').length < 11) {
      return await interaction.editReply({
        content: isPt
          ? 'Por favor, informe um CPF válido (mínimo de 11 dígitos).'
          : 'Please provide a valid CPF tax ID (minimum of 11 digits).'
      });
    }

    try {
      // Criar registro de doação pendente no banco de dados
      const donation = db.addDonation({
        user_id: interaction.user.id,
        username: interaction.user.username,
        email: email,
        amount: amountBrl,
        currency: 'BRL',
        gateway: 'mercadopago',
        status: 'pending',
        channel_id: interaction.channelId,
        cpf: cpf,
        is_pt: isPt
      });

      const paymentData = await createPixPayment({
        donationId: donation.id,
        amount: donation.amount,
        email: donation.email,
        cpf: cpf,
        userId: donation.user_id,
        username: donation.username
      });

      db.updateDonation(donation.id, {
        payment_id: paymentData.paymentId,
        pix_code: paymentData.qrCode
      });

      const { sendAdminPendingNotification } = await import('../bot.js');
      await sendAdminPendingNotification(donation.id).catch(err => console.error('[ModalHandler] Erro ao enviar notificação de log:', err));

      const qrCodeBuffer = await generateQrCodeBuffer(paymentData.qrCode);
      const attachment = new AttachmentBuilder(qrCodeBuffer, { name: 'pix-qrcode.png' });

      return await interaction.editReply({
        content: isPt
          ? `⚡ **Pagamento PIX Gerado!**\n` +
            `Escaneie o QR Code abaixo no aplicativo do seu banco para pagar **R$ ${donation.amount.toFixed(2)}**:\n\n` +
            `*Ou use o PIX Copia e Cola abaixo:*`
          : `⚡ **PIX Payment Generated (BRL only)!**\n` +
            `Scan the QR Code below in your banking app to pay **R$ ${donation.amount.toFixed(2)}**:\n\n` +
            `*Or use the Copy & Paste code below:*`,
        files: [attachment],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`pix_code_text_${donation.id}`)
              .setLabel(isPt ? 'Copiar Código Pix Copia e Cola' : 'Show Copy & Paste Code')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    } catch (err) {
      console.error('[ModalHandler] Erro ao registrar/gerar PIX:', err);
      await interaction.editReply({ 
        content: isPt 
          ? `Erro ao processar PIX: ${err.message}` 
          : `Error processing PIX: ${err.message}` 
      });
    }
  }

  // 3. Submissão do Modal do Cartão Stripe (apenas e-mail)
  if (customId.startsWith('donate_modal_card_')) {
    await interaction.deferReply();
    const amountBrl = Math.round(parseFloat(customId.replace('donate_modal_card_', '')) * 100) / 100;
    const email = interaction.fields.getTextInputValue('email').trim();

    // Validação básica de e-mail
    if (!email.includes('@') || !email.includes('.')) {
      return await interaction.editReply({ 
        content: isPt 
          ? 'Por favor, informe um e-mail válido para receber o recibo.' 
          : 'Please provide a valid email so you can receive the receipt.' 
      });
    }

    try {
      // Criar registro de doação pendente no banco de dados
      const donation = db.addDonation({
        user_id: interaction.user.id,
        username: interaction.user.username,
        email: email,
        amount: amountBrl,
        currency: 'BRL',
        gateway: 'stripe',
        status: 'pending',
        channel_id: interaction.channelId,
        is_pt: isPt
      });

      const session = await createStripeSession({
        donationId: donation.id,
        amountBrl: donation.amount,
        email: donation.email,
        userId: donation.user_id,
        username: donation.username,
        isPt: isPt
      });

      db.updateDonation(donation.id, {
        payment_id: session.sessionId
      });

      const { sendAdminPendingNotification } = await import('../bot.js');
      await sendAdminPendingNotification(donation.id).catch(err => console.error('[ModalHandler] Erro ao enviar notificação de log:', err));

      const amountUsd = amountBrl / exchangeRate;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(isPt ? 'Pagar com Cartão (Stripe)' : 'Pay with Credit Card (Stripe)')
          .setURL(session.url)
          .setStyle(ButtonStyle.Link)
      );

      return await interaction.editReply({
        content: isPt
          ? `💳 **Checkout criado com sucesso!**\nClique no botão abaixo para preencher os dados do cartão de crédito com segurança no checkout oficial da Stripe (R$ ${donation.amount.toFixed(2)}):`
          : `💳 **Checkout session created successfully!**\nClick the button below to fill in your card details securely on the official Stripe checkout page ($ ${amountUsd.toFixed(2)} USD):`,
        components: [row]
      });
    } catch (err) {
      console.error('[ModalHandler] Erro ao registrar/gerar checkout Stripe:', err);
      await interaction.editReply({ 
        content: isPt 
          ? `Erro ao processar pagamento: ${err.message}` 
          : `Error processing payment: ${err.message}` 
      });
    }
  }
}
