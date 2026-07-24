// Shared builders for the ticket panel and ticket-channel messages.
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { FREE_KEY_URL } = require('./config');

// The panel that lives in #open-a-ticket (support only — free keys moved into games).
function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 EazyCheats Support')
    .setDescription(
      'Need help? Click the button below to open your own **private ticket**.\n\n' +
      'Only you and our staff can see it.'
    )
    .setFooter({ text: 'EazyCheats — We make you better at games' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Request Help')
      .setEmoji('🆘')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

// Game picker panel (in #choose-your-games) — one toggle button per game.
function buildGamePicker(games) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎮 Choose Your Games')
    .setDescription(
      'Click a button to unlock that game\'s channels (suggestions, updates, ' +
      'free keys, script). Click again to hide it.\n\n' +
      games.map((g) => `${g.emoji} **${g.name}**`).join('\n')
    )
    .setFooter({ text: 'EazyCheats' });

  const row = new ActionRowBuilder().addComponents(
    games.map((g) => new ButtonBuilder()
      .setCustomId(`game_toggle_${g.key}`)
      .setLabel(g.name)
      .setEmoji(g.emoji)
      .setStyle(ButtonStyle.Secondary))
  );

  return { embeds: [embed], components: [row] };
}

// Free-key link panel (in each game's <prefix>-free-key channel). The button
// hands the user the key-page link to copy/open — key generation lives on the site.
function buildFreeKeyLinkPanel(game) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${game.emoji} ${game.name} — Free Key`)
    .setDescription(
      '**Go here for your free key:**\n' +
      FREE_KEY_URL + '\n\n' +
      'Or click **Get Free Key** below and the link will be sent to you to copy.'
    )
    .setFooter({ text: 'EazyCheats — free key' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('freekey_link')
      .setLabel('Get Free Key')
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

// Reference list of every staff/mod command, posted in #staff-commands.
function buildStaffCommandsInfo() {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🛠️ Staff Commands')
    .setDescription('All commands are **mods only** and hidden from regular members.')
    .addFields(
      { name: '🎫 Tickets', value:
        '`/add <user>` — add someone to the current ticket\n' +
        '`/remove <user>` — remove someone from the current ticket\n' +
        '`/closeticket` — close & delete the current ticket' },
    )
    .setFooter({ text: 'EazyCheats — staff reference' });
  return { embeds: [embed] };
}

module.exports = {
  buildTicketPanel, buildTicketWelcome, buildGamePicker, buildFreeKeyLinkPanel, buildStaffCommandsInfo,
};
