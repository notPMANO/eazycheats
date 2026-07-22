// Shared builders for the ticket panel and ticket-channel messages.
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

// The panel that lives in #open-a-ticket (support only — free keys moved into games).
function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 EazyCheats Support')
    .setDescription(
      'Need help? Click the button below to open your own **private ticket**.\n\n' +
      'Only you and our staff can see it.\n\n' +
      '_Looking for a free key? Head to your game\'s **generate-free-key** channel._'
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

// Free-key panel (in each game's <prefix>-freekey channel).
function buildFreeKeyPanel(game) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${game.emoji} ${game.name} — Free Key`)
    .setDescription(
      'Click below to open your private key ticket and get an auto-generated ' +
      `**free key** for ${game.name} (valid 4 hours).\n\n` +
      'You get one ticket — when your key expires, press **Get New Key** inside it.'
    )
    .setFooter({ text: 'EazyCheats — free key' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`freekey_request_${game.key}`)
      .setLabel('Generate Free Key')
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
        '`/closeticket` — close & delete the current ticket (support or free-key)' },
      { name: '🔑 Keys', value:
        '`/premiumkey [length] [bind]` — generate a **permanent** premium key\n' +
        '`/revoke <key>` — disable a key so it stops validating\n' +
        '`/hwidbind <key> <on>` — turn a key\'s device-lock on/off' },
    )
    .setFooter({ text: 'EazyCheats — staff reference' });
  return { embeds: [embed] };
}

module.exports = {
  buildTicketPanel, buildTicketWelcome, buildGamePicker, buildFreeKeyPanel, buildStaffCommandsInfo,
};
