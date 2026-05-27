import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { db } from '../db.js';
import { notifyApprovedPayment } from '../bot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('aprovar-doacao')
    .setDescription('Aprova manualmente uma doação pendente (útil se o webhook falhar)')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID da doação (ex: don_...) ou ID do pagamento do Mercado Pago/Stripe')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const id = interaction.options.getString('id').trim();

    try {
      const donation = db.getDonation(id);
      if (!donation) {
        return await interaction.editReply({
          content: `❌ Doação com ID ou Payment ID \`${id}\` não foi encontrada no banco de dados.`
        });
      }

      if (donation.status === 'approved') {
        return await interaction.editReply({
          content: `ℹ️ Esta doação (ID: \`${donation.id}\`) já estava com status **aprovado**.`
        });
      }

      // Atualizar status no banco
      db.updateDonation(donation.id, { status: 'approved' });

      // Chamar fluxo de notificação e cargos
      await notifyApprovedPayment(donation.id);

      await interaction.editReply({
        content: `✅ Doação de **@${donation.username}** (Valor: R$ ${donation.amount.toFixed(2)}) aprovada manualmente com sucesso!`
      });
    } catch (err) {
      console.error('[Aprovar Command] Erro:', err);
      await interaction.editReply({
        content: `❌ Erro ao aprovar doação: ${err.message}`
      });
    }
  }
};
