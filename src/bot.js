import { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import config from './config.js';
import { db } from './db.js';

// Importar os comandos
import setupCommand, { generatePanelPayload } from './commands/setup.js';
import metaCommand from './commands/meta.js';
import setmetaCommand from './commands/setmeta.js';
import aprovarCommand from './commands/aprovar.js';

// Importar manipuladores de interações
import { handleButtonInteraction } from './interactions/buttonHandler.js';
import { handleModalInteraction } from './interactions/modalHandler.js';
import { handleSelectMenuInteraction } from './interactions/selectMenuHandler.js';

// Instanciar o cliente
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Mapa de comandos
const commands = new Map([
  [setupCommand.data.name, setupCommand],
  [metaCommand.data.name, metaCommand],
  [setmetaCommand.data.name, setmetaCommand],
  [aprovarCommand.data.name, aprovarCommand]
]);

// Inicialização do Bot
export async function initBot() {
  client.once('ready', async () => {
    console.log(`[Discord] Bot logado como ${client.user.tag}`);
    
    // Atualizar status do bot com a meta
    updateBotPresence();
    
    // Inicializar / Atualizar painel fixo no canal do config.json
    await initializeDonationPanel();

    // Registrar comandos Slash
    try {
      console.log('[Discord] Registrando comandos slash...');
      const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
      
      const commandsJSON = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
      
      // 1. Registrar globalmente (pode demorar até 1 hora para aparecer)
      await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: commandsJSON }
      );

      // 2. Registrar diretamente nas guildas (aparece INSTANTANEAMENTE para testes e uso)
      for (const [guildId, guild] of client.guilds.cache) {
        console.log(`[Discord] Registrando comandos slash locais na guilda: ${guild.name} (${guildId})`);
        await rest.put(
          Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
          { body: commandsJSON }
        );
      }
      
      console.log('[Discord] Comandos slash registrados com sucesso!');
    } catch (error) {
      console.error('[Discord] Erro ao registrar comandos slash:', error);
    }
  });

  // Listener de Interações
  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        console.log(`[Discord] Comando /${interaction.commandName} executado por ${interaction.user.tag}`);
        await command.execute(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }
    } catch (err) {
      console.error('[Discord] Erro ao processar interação:', err);
      // Evitar crash do bot
      const errorMessage = { content: 'Ocorreu um erro ao processar esta interação.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  });

  // Login
  await client.login(config.DISCORD_TOKEN);
}

// Atualizar Presença do Bot
export function updateBotPresence() {
  try {
    const totals = db.getTotals();
    const targetBrl = db.getConfig('donation_goal_brl', config.DONATION_GOAL_BRL);
    const percent = Math.min(Math.round((totals.brl / targetBrl) * 100), 100);
    
    client.user.setPresence({
      activities: [{
        name: `Meta: R$ ${totals.brl.toFixed(0)}/R$ ${targetBrl} (${percent}%)`,
        type: ActivityType.Watching
      }],
      status: 'online'
    });
  } catch (err) {
    console.error('[Discord] Erro ao atualizar presença:', err.message);
  }
}

// Função para auto-inicializar e checar se o painel fixo existe (chamado no ready)
export async function initializeDonationPanel() {
  try {
    const channelId = config.DONATION_CHANNEL_ID;
    if (!channelId || channelId === 'INSIRA_O_ID_DO_CANAL_DE_DOACAO_AQUI') {
      console.log('[Discord] ID do canal de doações não configurado no config.json. Pulando auto-inicialização do painel.');
      return;
    }

    console.log(`[Discord] Verificando painel de doações no canal ${channelId}...`);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error(`[Discord] Canal de doações (${channelId}) não encontrado ou não é de texto.`);
      return;
    }

    const savedMessageId = db.getConfig('panel_message_id');
    let message = null;

    if (savedMessageId) {
      // Tentar buscar a mensagem no canal correspondente
      message = await channel.messages.fetch(savedMessageId).catch(() => null);
    }

    const payload = generatePanelPayload();

    if (message) {
      console.log('[Discord] Painel encontrado! Atualizando informações de metas...');
      await message.edit(payload);
      console.log('[Discord] Painel fixo updated.');
    } else {
      console.log('[Discord] Painel não encontrado no canal. Criando uma nova mensagem de doação...');
      const newMsg = await channel.send(payload);
      
      // Salvar IDs no banco local
      db.setConfig('panel_channel_id', channelId);
      db.setConfig('panel_message_id', newMsg.id);
      
      console.log(`[Discord] Novo painel fixo de doações criado! ID da Mensagem: ${newMsg.id}`);
    }
  } catch (err) {
    console.error('[Discord] Erro ao auto-inicializar o painel:', err.message);
  }
}

// Função para atualizar dinamicamente o painel fixo de doações
export async function updateMainPanel() {
  try {
    const channelId = db.getConfig('panel_channel_id');
    const messageId = db.getConfig('panel_message_id');

    if (!channelId || !messageId) {
      return;
    }

    console.log(`[Discord] Editando painel fixo de metas no canal ${channelId}...`);

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.log('[Discord] Canal do painel fixo não encontrado ou inválido.');
      return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      console.log('[Discord] Mensagem do painel fixo não encontrada.');
      return;
    }

    const payload = generatePanelPayload();
    await message.edit(payload);
    console.log('[Discord] Painel fixo de metas atualizado com sucesso!');
  } catch (err) {
    console.error('[Discord] Erro ao atualizar o painel fixo:', err.message);
  }
}

// Notificar Pagamento Aprovado (Chamado pelo Webhook Server ou verificação manual)
export async function notifyApprovedPayment(donationId) {
  try {
    const donation = db.getDonation(donationId);
    if (!donation) return;

    // Atualizar status do bot (presença) e o painel fixo público
    updateBotPresence();
    await updateMainPanel();

    // Se a doação tiver uma mensagem de logs/admin pendente, vamos editá-la para marcar como Aprovado e tirar o botão
    if (donation.admin_msg_id) {
      try {
        const channelId = config.LOG_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(donation.admin_msg_id).catch(() => null);
          if (message && message.components.length > 0) {
            const originalEmbed = EmbedBuilder.from(message.embeds[0]);
            originalEmbed.setColor('#00FF00');
            const fields = originalEmbed.data.fields.filter(f => f.name !== 'Status');
            originalEmbed.setFields(
              ...fields,
              { name: 'Status', value: `✅ Aprovado (Automático / Webhook)`, inline: true }
            );
            await message.edit({ embeds: [originalEmbed], components: [] });
          }
        }
      } catch (err) {
        console.error('[Discord] Erro ao atualizar mensagem administrativa após aprovação:', err.message);
      }
    }

    // Determinar o idioma com base nos cargos reais do usuário no Discord (ou fallback no banco)
    let isPt = donation.is_pt !== false;
    let member = null;

    try {
      for (const [guildId, guild] of client.guilds.cache) {
        member = await guild.members.fetch(donation.user_id).catch(() => null);
        if (member) {
          if (config.ROLE_ENGLISH_ID && member.roles.cache.has(config.ROLE_ENGLISH_ID)) {
            isPt = false;
          } else if (config.ROLE_PORTUGUESE_ID && member.roles.cache.has(config.ROLE_PORTUGUESE_ID)) {
            isPt = true;
          }
          break;
        }
      }
    } catch (memberErr) {
      console.error('[Discord] Erro ao buscar membro para verificação de idioma:', memberErr.message);
    }

    // 1. Enviar DM ao Usuário
    try {
      const user = await client.users.fetch(donation.user_id);
      if (user) {
        const exchangeRate = db.getTotals().exchangeRate || 5.0;
        const amountDisplay = isPt 
          ? `R$ ${donation.amount.toFixed(2)}` 
          : `$ ${(donation.amount / exchangeRate).toFixed(2)} USD`;
        const gatewayDisplay = donation.gateway === 'stripe'
          ? (isPt ? 'Stripe (Cartão)' : 'Stripe (Credit Card)')
          : (isPt ? 'Mercado Pago (PIX)' : 'Mercado Pago (PIX)');

        const dmEmbed = new EmbedBuilder()
          .setTitle(isPt ? '🎉 Obrigado pelo seu Apoio!' : '🎉 Thank you for your support!')
          .setDescription(
            isPt 
              ? `Olá **${donation.username}**, sua doação foi confirmada com sucesso!` 
              : `Hello **${donation.username}**, your donation has been successfully confirmed!`
          )
          .setColor('#00FF00')
          .addFields(
            { name: isPt ? 'Valor' : 'Amount', value: amountDisplay, inline: true },
            { name: 'Gateway', value: gatewayDisplay, inline: true },
            { name: isPt ? 'Data' : 'Date', value: new Date(donation.created_at).toLocaleDateString(isPt ? 'pt-BR' : 'en-US'), inline: true }
          )
          .setFooter({ text: isPt ? 'Seu apoio ajuda a manter nosso servidor ativo!' : 'Your support helps keep our server running!' })
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
        console.log(`[Discord] DM de agradecimento enviada para @${donation.username}`);
      }
    } catch (dmErr) {
      console.log(`[Discord] Não foi possível enviar DM para @${donation.username} (DMs fechadas).`);
    }

    // 2. Notificar no Canal do Ticket e Agendar Exclusão (1 minuto)
    if (donation.channel_id) {
      try {
        const ticketChannel = await client.channels.fetch(donation.channel_id).catch(() => null);
        if (ticketChannel && ticketChannel.isTextBased()) {
          const isPt = donation.is_pt !== false;
          const closingEmbed = new EmbedBuilder()
            .setTitle(isPt ? '🎉 Doação Confirmada!' : '🎉 Donation Confirmed!')
            .setDescription(
              isPt 
                ? 'Muito obrigado! Sua contribuição foi processada com sucesso.\n\n**Este canal privado será fechado automaticamente em 1 minuto.**'
                : 'Thank you very much! Your contribution has been processed successfully.\n\n**This private channel will close automatically in 1 minute.**'
            )
            .setColor('#00FF00')
            .setTimestamp();

          await ticketChannel.send({ embeds: [closingEmbed] });

          // Excluir canal em 60 segundos
          setTimeout(async () => {
            await ticketChannel.delete('Doação confirmada com sucesso').catch(() => {});
            console.log(`[Discord] Canal privado de doação ${donation.channel_id} deletado automaticamente.`);
          }, 60000);
        }
      } catch (ticketErr) {
        console.error('[Discord] Falha ao gerenciar canal privado pós-pagamento:', ticketErr.message);
      }
    }

    // 3. Entregar Cargo VIP (se configurado)
    let roleStatus = 'Não configurado';
    if (config.VIP_ROLE_ID && config.VIP_ROLE_ID !== 'INSIRA_O_ID_DO_CARGO_VIP_AQUI') {
      try {
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            const member = await guild.members.fetch(donation.user_id).catch(() => null);
            if (member) {
              const role = await guild.roles.fetch(config.VIP_ROLE_ID);
              if (role) {
                await member.roles.add(role);
                console.log(`[Discord] Cargo VIP adicionado para @${donation.username} na guilda ${guild.name}`);
                roleStatus = `Cargo **${role.name}** adicionado!`;
                break; // Cargo entregue
              }
            }
          } catch (roleErr) {
            console.error(`[Discord] Erro ao tentar adicionar cargo na guilda ${guildId}:`, roleErr.message);
          }
        }
      } catch (err) {
        console.error('[Discord] Falha geral ao gerenciar cargo:', err.message);
      }
    }

    // 4. Enviar mensagem pública de agradecimento (se configurado)
    if (config.LOG_CHANNEL_ID && config.LOG_CHANNEL_ID !== 'INSIRA_O_ID_DO_CANAL_DE_AGRADECIMENTO_AQUI') {
      try {
        const channel = await client.channels.fetch(config.LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle('💖 Nova Doação Confirmada!')
            .setDescription(`Agradecemos imensamente a **<@${donation.user_id}>** por apoiar o servidor!`)
            .setColor('#FF007F')
            .addFields(
              { name: 'Doador', value: `<@${donation.user_id}>`, inline: true },
              { name: 'Valor da Contribuição', value: donation.currency === 'BRL' ? `**R$ ${donation.amount.toFixed(2)}**` : `**$ ${donation.amount.toFixed(2)} USD**`, inline: true },
              { name: 'Benefício VIP', value: roleStatus, inline: true }
            )
            .setThumbnail('https://i.imgur.com/8Q5N8tH.png')
            .setFooter({ text: 'Obrigado por fortalecer nossa comunidade!' })
            .setTimestamp();

          await channel.send({ embeds: [logEmbed] });
          console.log(`[Discord] Mensagem de agradecimento enviada no canal ${config.LOG_CHANNEL_ID}`);
        }
      } catch (logErr) {
        console.error('[Discord] Erro ao enviar mensagem de agradecimento pública:', logErr.message);
      }
    }
  } catch (err) {
    console.error('[Discord] Erro no fluxo de notificação de pagamento aprovado:', err);
  }
}

/**
 * Envia uma notificação com botão de aprovação rápida no canal de logs/adm
 * sempre que uma nova intenção de doação pendente é registrada.
 */
export async function sendAdminPendingNotification(donationId) {
  try {
    const donation = db.getDonation(donationId);
    if (!donation) return;

    const channelId = config.LOG_CHANNEL_ID;
    if (!channelId || channelId === 'INSIRA_O_ID_DO_CANAL_DE_AGRADECIMENTO_AQUI') return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const isPt = donation.is_pt !== false;
    const exchangeRate = db.getTotals().exchangeRate || 5.0;
    const amountDisplay = isPt 
      ? `R$ ${donation.amount.toFixed(2)}` 
      : `$ ${(donation.amount / exchangeRate).toFixed(2)} USD`;

    const embed = new EmbedBuilder()
      .setTitle('⏳ Nova Solicitação de Doação / New Donation Requested')
      .setDescription(`Um usuário iniciou uma intenção de doação.`)
      .setColor('#FFA500')
      .addFields(
        { name: 'Doador / Donor', value: `<@${donation.user_id}> (${donation.username})`, inline: true },
        { name: 'Valor / Amount', value: amountDisplay, inline: true },
        { name: 'Gateway', value: donation.gateway === 'stripe' ? 'Stripe (Cartão)' : 'Mercado Pago (PIX)', inline: true },
        { name: 'E-mail', value: donation.email, inline: true },
        { name: 'ID da Doação', value: donation.id, inline: true },
        { name: 'Status', value: `Pendente (Aguardando Pagamento)`, inline: true }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_approve_donation_${donation.id}`)
        .setLabel('Aprovar Pagamento / Approve Payment')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    
    // Salvar o ID da mensagem no objeto da doação
    db.updateDonation(donation.id, { admin_msg_id: msg.id });
  } catch (err) {
    console.error('[Discord] Erro ao enviar notificação administrativa pendente:', err.message);
  }
}
