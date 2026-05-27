import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../db.js';
import { getLocaleIsPt } from '../utils/language.js';

export async function handleSelectMenuInteraction(interaction) {
  if (interaction.customId !== 'donate_select_value') return;

  const value = interaction.values[0];
  const isPt = getLocaleIsPt(interaction);
  const totals = db.getTotals();
  const exchangeRate = totals.exchangeRate;

  // 1. Escolheu Valor Personalizado -> Abre Modal apenas para digitar o valor
  if (value === 'custom') {
    const modal = new ModalBuilder()
      .setCustomId('donate_modal_custom_value')
      .setTitle(isPt ? 'Valor da Doação' : 'Donation Amount');

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel(isPt ? 'Valor da Doação (em Reais)' : 'Donation Amount (in USD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(isPt ? 'Ex: 50' : 'E.g. 10')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    return await interaction.showModal(modal);
  }

  // 2. Escolheu valor pré-definido -> Envia o embed de escolha de pagamento com foco nos botões
  const amount = parseFloat(value);
  const amountUsd = amount / exchangeRate;

  const embed = new EmbedBuilder()
    .setTitle(isPt ? '🛒 Escolha a forma de pagamento' : '🛒 Choose Payment Method')
    .setDescription(
      isPt
        ? `Você selecionou doar **R$ ${amount.toFixed(2)}**.\n\nEscolha como deseja pagar abaixo:`
        : `You selected to donate **$ ${amountUsd.toFixed(2)} USD**.\n\nChoose how you want to pay below:`
    )
    .setColor('#FF007F');

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`select_pay_pix_${amount}`)
      .setLabel(isPt ? 'PIX (Mercado Pago)' : 'PIX (Brazil Only)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚡'),
    new ButtonBuilder()
      .setCustomId(`select_pay_card_${amount}`)
      .setLabel(isPt ? 'Cartão de Crédito (Stripe)' : 'Credit Card (Stripe)')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💳')
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons]
  });
}
