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
      'Pick an option below to open your own **private ticket**.\n\n' +
      '🆘 **Request Help** — talk to our staff about any issue.\n' +
      '🔑 **Request Free Key** — get an auto-generated free key (valid 4 hours).\n\n' +
      'Only you and our staff can see your ticket. Check <#faq> and <#support-info> first!'
    )
    .setFooter({ text: 'EazyCheats — We make you better at games' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Request Help')
      .setEmoji('🆘')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('freekey_request')
      .setLabel('Request Free Key')
      .setEmoji('🔑')
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
