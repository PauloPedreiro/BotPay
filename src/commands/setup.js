import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import config from '../config.js';
import { db } from '../db.js';

// Função para gerar o payload do painel principal (público com botão de início carregado do config)
export function generatePanelPayload() {
  const totals = db.getTotals();
  const targetBrl = db.getConfig('donation_goal_brl', config.DONATION_GOAL_BRL || 2500);
  const exchangeRate = totals.exchangeRate;
  
  const targetUsd = targetBrl / exchangeRate;
  const percentage = (totals.brl / targetBrl) * 100;
  
  // Barra de progresso visual
  const totalBlocks = 15;
  const filledBlocks = Math.min(Math.round((percentage / 100) * totalBlocks), totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  const lastUpdatedTimestamp = db.getConfig('usd_brl_last_updated', 0);
  const lastUpdatedStr = lastUpdatedTimestamp > 0 
    ? new Date(lastUpdatedTimestamp).toLocaleString('pt-BR') 
    : 'Nunca';

  // Obter textos do config com fallbacks de segurança
  const title = config.PANEL_TITLE || '💖 Central de Apoio & Meta do Servidor / Server Goal';
  const descPt = config.PANEL_DESC_PT || 'Ajude-nos a manter o servidor online e com alto desempenho! As doações são voluntárias e todos os fundos arrecadados são reinvestidos em melhorias.\n🏆 *Vantagens:* Cargo especial de Doador no Discord e acesso a canais exclusivos.';
  const descEn = config.PANEL_DESC_EN || 'Help us keep the server online and performing at its best! Donations are voluntary and all funds are reinvested directly into server improvements.\n🏆 *Perks:* Special Donor role on Discord and access to exclusive VIP channels.';
  
  const metaTitle = config.PANEL_META_TITLE || '📊 **Status da Meta Mensal / Monthly Goal Status:**';
  const brlLabel = config.PANEL_BRL_LABEL || '🇧🇷 **Real (BRL):**';
  const usdLabel = config.PANEL_USD_LABEL || '🇺🇸 **Dólar (USD):**';
  const exchangeLabel = config.PANEL_EXCHANGE_LABEL || '💱 *Cotação / Exchange Rate:*';
  const footerText = config.PANEL_FOOTER || 'Clique no botão abaixo para iniciar / Click below to start';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      '**🇧🇷 Português:**\n' + descPt + '\n\n' +
      '**🇺🇸 English:**\n' + descEn + '\n\n' +
      `${metaTitle}\n` +
      `\`[${progressBar}]\` **${percentage.toFixed(1)}%**\n\n` +
      `${brlLabel} R$ ${totals.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / R$ ${targetBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `${usdLabel} $ ${totals.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD / $ ${targetUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\n` +
      `${exchangeLabel} 1 USD = R$ ${exchangeRate.toFixed(2)} *(Atualizado: ${lastUpdatedStr})*`
    )
    .setColor('#FF007F')
    .setFooter({ text: footerText })
    .setTimestamp();

  // Botão único para iniciar o fluxo privado (ticket)
  const startButton = new ButtonBuilder()
    .setCustomId('start_donation_flow')
    .setLabel('Apoiar o Servidor / Support Server')
    .setStyle(ButtonStyle.Success)
    .setEmoji('💖');

  const row = new ActionRowBuilder().addComponents(startButton);

  return { embeds: [embed], components: [row] };
}

export default {
  data: new SlashCommandBuilder()
    .setName('setup-painel')
    .setDescription('Envia o painel de doações interativo para este canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const payload = generatePanelPayload();
      const message = await interaction.channel.send(payload);

      db.setConfig('panel_channel_id', message.channelId);
      db.setConfig('panel_message_id', message.id);

      await interaction.editReply({ content: 'Painel de doações configurado e registrado com sucesso!' });
    } catch (err) {
      console.error('[Setup Command] Erro ao criar o painel:', err);
      await interaction.editReply({ content: `Erro ao criar o painel: ${err.message}` });
    }
  }
};
