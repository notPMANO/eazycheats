// Shared builders for the ticket panel and ticket-channel messages.
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

// The panel that lives in #open-a-ticket.
function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 EazyCheats Support')
    .setDescription(
      'Need help? Click the button below to open a **private ticket**.\n\n' +
      'Only you and our staff will be able to see it.\n\n' +
      '**Before opening a ticket:**\n' +
      '• Check <#faq> and <#support-info>\n' +
      '• Have your order/username ready\n' +
      '• Be patient — staff will respond as soon as they can.'
    )
    .setFooter({ text: 'EazyCheats — We make you better at games' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Open Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

// The first message inside a freshly created ticket channel.
function buildTicketWelcome(userId, staffMention) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 Ticket opened')
    .setDescription(
      `Hey <@${userId}>, thanks for reaching out!\n\n` +
      'Please describe your issue in detail and a staff member ' +
      `(${staffMention}) will be with you shortly.\n\n` +
      'When your issue is resolved, click **Close Ticket** below.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  return { content: `<@${userId}>`, embeds: [embed], components: [row] };
}

module.exports = { buildTicketPanel, buildTicketWelcome };
