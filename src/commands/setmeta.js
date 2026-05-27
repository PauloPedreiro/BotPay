import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { db } from '../db.js';
import { updateBotPresence, updateMainPanel } from '../bot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set-meta')
    .setDescription('Configura o valor da meta de doações mensal (em Reais)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addNumberOption(option => 
      option.setName('valor')
        .setDescription('O valor em reais da nova meta (ex: 2500)')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const newGoal = interaction.options.getNumber('valor');

    try {
      db.setConfig('donation_goal_brl', newGoal);
      updateBotPresence();
      await updateMainPanel();

      await interaction.reply({
        content: `A meta mensal de doações foi alterada com sucesso para **R$ ${newGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**!`,
        ephemeral: true
      });
    } catch (err) {
      console.error('[SetMeta Command] Erro ao salvar meta:', err);
      await interaction.reply({
        content: `Houve um erro ao atualizar a meta: ${err.message}`,
        ephemeral: true
      });
    }
  }
};
