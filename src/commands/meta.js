import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../db.js';
import config from '../config.js';

export function generateMetaEmbed() {
  const totals = db.getTotals();
  const targetBrl = db.getConfig('donation_goal_brl', config.DONATION_GOAL_BRL || 2500);
  const exchangeRate = totals.exchangeRate;
  
  const targetUsd = targetBrl / exchangeRate;
  const percentage = (totals.brl / targetBrl) * 100;
  
  // Barra de progresso visual elegante
  const totalBlocks = 15;
  const filledBlocks = Math.min(Math.round((percentage / 100) * totalBlocks), totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  const progressBar = '▰'.repeat(filledBlocks) + '▱'.repeat(emptyBlocks);

  // Formatação de data da última atualização de câmbio
  const lastUpdatedTimestamp = db.getConfig('usd_brl_last_updated', 0);
  const lastUpdatedStr = lastUpdatedTimestamp > 0 
    ? new Date(lastUpdatedTimestamp).toLocaleString('pt-BR') 
    : 'Nunca (Padrão)';

  return new EmbedBuilder()
    .setTitle('📊 Painel de Transparência - Meta de Doações')
    .setDescription(
      `Obrigado a todos que apoiam o nosso servidor! Veja o nosso progresso mensal:\n\n` +
      `**Progresso:** \`${progressBar}\` **${percentage.toFixed(1)}%**`
    )
    .setColor('#FF007F')
    .addFields(
      { 
        name: '🇧🇷 Valor em Real (BRL)', 
        value: `💰 **Arrecadado:** R$ ${totals.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
               `🎯 **Meta:** R$ ${targetBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        inline: true 
      },
      { 
        name: '🇺🇸 Valor em Dólar (USD)', 
        value: `💰 **Arrecadado:** $ ${totals.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD\n` +
               `🎯 **Meta:** $ ${targetUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
        inline: true 
      },
      {
        name: '💱 Informações do Câmbio',
        value: `• **Cotação atual:** 1 USD = **R$ ${exchangeRate.toFixed(2)}**\n` +
               `• **Última atualização:** \`${lastUpdatedStr}\` (Atualizado a cada 24h)`,
        inline: false
      }
    )
    .setFooter({ text: 'Doações via PIX confirmam na hora. Cartão de crédito pode levar alguns minutos.' })
    .setTimestamp();
}

export default {
  data: new SlashCommandBuilder()
    .setName('meta')
    .setDescription('Exibe o progresso atual da meta de doações mensal'),

  async execute(interaction) {
    try {
      const embed = generateMetaEmbed();
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Meta Command] Erro:', err);
      await interaction.reply({ 
        content: `Ocorreu um erro ao buscar os dados da meta: ${err.message}`, 
        ephemeral: true 
      });
    }
  }
};
