import { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../db.js';
import { createPixPayment, generateQrCodeBuffer } from '../gateways/mercadopago.js';
import { createStripeSession } from '../gateways/stripe.js';
import { getLocaleIsPt } from '../utils/language.js';

export async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  const isPt = getLocaleIsPt(interaction);
  const { guild } = interaction;

  // 1. Iniciar Fluxo de Doação (Criar Canal Privado/Ticket)
  if (customId === 'start_donation_flow') {
    if (!guild) {
      return await interaction.reply({
        content: isPt 
          ? 'Este comando só pode ser usado dentro de um servidor.' 
          : 'This command can only be used inside a server.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const channelName = `💸-doar-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

      // Verificar se já existe um canal com esse nome aberto
      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return await interaction.editReply({
          content: isPt
            ? `Você já possui um canal de doação aberto: <#${existingChannel.id}>`
            : `You already have an open donation channel: <#${existingChannel.id}>`
        });
      }

      // Criar o canal privado de texto
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel] // Esconder de todos
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ] // Permitir doador
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ] // Permitir Bot
          }
        ]
      });

      // Obter taxas de câmbio para exibir a estimativa em USD no menu dropdown do ticket
      const totals = db.getTotals();
      const exchangeRate = totals.exchangeRate;

      // Criar Embed de boas-vindas ao canal privado
      const ticketEmbed = new EmbedBuilder()
        .setTitle(isPt ? '💖 Central de Doação Privada' : '💖 Private Donation Center')
        .setDescription(
          isPt
            ? `Olá <@${interaction.user.id}>, bem-vindo ao seu espaço de doação privado.\n\n` +
              `Selecione o valor que deseja doar no menu dropdown abaixo. Após escolher, você selecionará se deseja pagar por PIX ou Cartão.`
            : `Hello <@${interaction.user.id}>, welcome to your private donation space.\n\n` +
              `Select the amount you wish to donate in the dropdown menu below. Afterwards, you will choose to pay via PIX or Credit Card.`
        )
        .setColor('#FF007F');

      // Opções separadas por idioma (apenas BRL para PT-BR, apenas USD para Inglês/Outros)
      const menuOptions = isPt ? [
        {
          label: 'Doar R$ 10,00',
          value: '10',
          emoji: '💵'
        },
        {
          label: 'Doar R$ 25,00',
          value: '25',
          emoji: '💴'
        },
        {
          label: 'Doar R$ 50,00',
          value: '50',
          emoji: '💶'
        },
        {
          label: 'Doar R$ 100,00',
          value: '100',
          emoji: '💷'
        },
        {
          label: 'Valor Personalizado',
          value: 'custom',
          emoji: '💸'
        }
      ] : [
        {
          label: `Donate $ ${(10 / exchangeRate).toFixed(2)} USD`,
          value: '10',
          emoji: '💵'
        },
        {
          label: `Donate $ ${(25 / exchangeRate).toFixed(2)} USD`,
          value: '25',
          emoji: '💴'
        },
        {
          label: `Donate $ ${(50 / exchangeRate).toFixed(2)} USD`,
          value: '50',
          emoji: '💶'
        },
        {
          label: `Donate $ ${(100 / exchangeRate).toFixed(2)} USD`,
          value: '100',
          emoji: '💷'
        },
        {
          label: 'Custom Value',
          value: 'custom',
          emoji: '💸'
        }
      ];

      // Menu dropdown dinâmico
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('donate_select_value')
        .setPlaceholder(isPt ? 'Escolha o valor da doação...' : 'Choose donation amount...')
        .addOptions(menuOptions);

      // Botão para fechar o canal
      const closeButton = new ButtonBuilder()
        .setCustomId('close_donation_channel')
        .setLabel(isPt ? 'Cancelar e Fechar Canal' : 'Cancel & Close Channel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);
      const buttonRow = new ActionRowBuilder().addComponents(closeButton);

      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [ticketEmbed],
        components: [selectRow, buttonRow]
      });

      await interaction.editReply({
        content: isPt
          ? `Seu canal privado de doação foi criado com sucesso: <#${channel.id}>. Clique nele para prosseguir!`
          : `Your private donation channel has been created: <#${channel.id}>. Click it to proceed!`
      });
    } catch (err) {
      console.error('[ButtonHandler] Erro ao criar canal privado:', err);
      await interaction.editReply({
        content: isPt
          ? `Erro ao criar o canal de doação: ${err.message}`
          : `Error creating donation channel: ${err.message}`
      });
    }
    return;
  }

  // 2. Fechar / Excluir Canal de Doação
  if (customId === 'close_donation_channel') {
    try {
      console.log(`[Discord] Excluindo canal de doação ${interaction.channel.name} a pedido do usuário.`);
      await interaction.reply({
        content: isPt 
          ? 'Cancelando doação e excluindo canal...' 
          : 'Canceling donation and deleting channel...',
        ephemeral: true
      });
      // Deletar o canal após 2 segundos
      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 2000);
    } catch (err) {
      console.error('[ButtonHandler] Erro ao excluir canal:', err.message);
    }
    return;
  }

  // 3. Ao clicar no botão "PIX (Mercado Pago)" -> Abre modal focado no PIX (e-mail + CPF)
  if (customId.startsWith('select_pay_pix_')) {
    const amount = customId.replace('select_pay_pix_', '');
    const modal = new ModalBuilder()
      .setCustomId(`donate_modal_pix_${amount}`)
      .setTitle(isPt ? 'Dados para Pagamento PIX' : 'PIX Payment Details');

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel(isPt ? 'Seu E-mail (Para receber o recibo)' : 'Your Email (For the receipt)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('exemplo@email.com')
      .setRequired(true);

    const cpfInput = new TextInputBuilder()
      .setCustomId('cpf')
      .setLabel(isPt ? 'Seu CPF (Obrigatório para PIX)' : 'Your CPF (Brazilian Tax ID - Required)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('000.000.000-00')
      .setRequired(true)
      .setMaxLength(14);

    modal.addComponents(
      new ActionRowBuilder().addComponents(emailInput),
      new ActionRowBuilder().addComponents(cpfInput)
    );

    return await interaction.showModal(modal);
  }

  // 4. Ao clicar no botão "Cartão de Crédito (Stripe)" -> Abre modal focado no Cartão (apenas e-mail)
  if (customId.startsWith('select_pay_card_')) {
    const amount = customId.replace('select_pay_card_', '');
    const modal = new ModalBuilder()
      .setCustomId(`donate_modal_card_${amount}`)
      .setTitle(isPt ? 'Dados para Cartão de Crédito' : 'Credit Card Details');

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel(isPt ? 'Seu E-mail (Para receber o recibo)' : 'Your Email (For the receipt)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('exemplo@email.com')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(emailInput));
    return await interaction.showModal(modal);
  }

  // 5. Mostrar o Código PIX Copia e Cola
  if (customId.startsWith('pix_code_text_')) {
    await interaction.deferReply({ ephemeral: true });
    const donationId = customId.replace('pix_code_text_', '');

    try {
      const donation = db.getDonation(donationId);
      if (!donation || !donation.payment_id) {
        return await interaction.editReply({ 
          content: isPt
            ? 'Dados do pagamento não encontrados.'
            : 'Payment data not found.'
        });
      }

      const savedCode = donation.pix_code || 'Código não disponível. Gere uma nova doação.';

      await interaction.editReply({
        content: (isPt ? `Copie o código abaixo:` : `Copy the code below:`) + `\n\`\`\`\n${savedCode}\n\`\`\``
      });
    } catch (err) {
      console.error('[ButtonHandler] Erro ao buscar código Pix de texto:', err);
      await interaction.editReply({ 
        content: isPt
          ? 'Erro ao recuperar código PIX.' 
          : 'Error retrieving PIX code.' 
      });
    }
    return;
  }

  // 6. Administrador aprovar doação diretamente pelo botão no canal de logs
  if (customId.startsWith('admin_approve_donation_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: isPt 
          ? 'Apenas administradores podem aprovar doações.' 
          : 'Only administrators can approve donations.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const donationId = customId.replace('admin_approve_donation_', '');

    try {
      const donation = db.getDonation(donationId);
      if (!donation) {
        return await interaction.editReply({
          content: isPt ? 'Doação não encontrada no banco de dados.' : 'Donation not found in the database.'
        });
      }

      if (donation.status === 'approved') {
        return await interaction.editReply({
          content: isPt ? 'Esta doação já está aprovada!' : 'This donation is already approved!'
        });
      }

      // 1. Atualizar status no banco
      db.updateDonation(donation.id, { status: 'approved' });

      // 2. Notificar o usuário (DM, VIP, canal do ticket) e atualizar metas
      const { notifyApprovedPayment } = await import('../bot.js');
      await notifyApprovedPayment(donation.id);

      // 3. Atualizar a mensagem do canal admin para remover o botão e indicar aprovação
      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      originalEmbed.setColor('#00FF00');
      const fields = originalEmbed.data.fields.filter(f => f.name !== 'Status');
      originalEmbed.setFields(
        ...fields,
        { name: 'Status', value: isPt ? `✅ Aprovado Manualmente` : `✅ Approved Manually`, inline: true },
        { name: isPt ? 'Aprovado Por' : 'Approved By', value: `<@${interaction.user.id}>`, inline: true }
      );

      await interaction.message.edit({ embeds: [originalEmbed], components: [] });

      await interaction.editReply({
        content: isPt 
          ? `Doação de R$ ${donation.amount.toFixed(2)} aprovada e VIP entregue com sucesso!` 
          : `Donation of R$ ${donation.amount.toFixed(2)} successfully approved and VIP granted!`
      });
    } catch (err) {
      console.error('[ButtonHandler] Erro ao aprovar doação via botão:', err);
      await interaction.editReply({
        content: isPt 
          ? `Erro ao processar aprovação: ${err.message}` 
          : `Error processing approval: ${err.message}`
      });
    }
  }
}
