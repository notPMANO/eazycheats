// ===================================================================
//  bot.js — keeps the ticket + verification system alive.
//  Run with: npm start   (keep it running 24/7 to handle buttons)
// ===================================================================
require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, MessageFlags,
  EmbedBuilder, AttachmentBuilder, ApplicationCommandOptionType,
} = require('discord.js');
const {
  TICKET_STAFF_ROLES, MOD_ROLES, VERIFIED_ROLE, TICKET_CATEGORY, TICKET_LOG_CHANNEL,
  WELCOME_CHANNEL, KEY_ALERTS_CHANNEL, FREE_KEY_URL, GAMES,
} = require('./config');
const { buildTicketWelcome, buildGamePicker } = require('./ticket-panel');
const { buildWelcomeGreeting } = require('./welcome');
const { findKey, buildHwidAlert } = require('./freekey');

const gameByKey = (k) => GAMES.find((g) => g.key === k) || null;

const { DISCORD_TOKEN, GUILD_ID } = process.env;

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
// Send with no push notification (Discord "silent message") — for join greetings
// and free-key messages so they don't ping members/staff.
const SILENT = MessageFlags.SuppressNotifications;
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Greet new members in the #welcome channel.
client.on('guildMemberAdd', async (member) => {
  try {
    if (member.user.bot) return;
    const welcome = member.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === WELCOME_CHANNEL
    );
    if (!welcome) return;
    const verify = member.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === 'verify'
    );
    // Silent so joins don't ping the new member (or anyone watching #welcome).
    await welcome.send({ ...buildWelcomeGreeting(member, verify), flags: SILENT });
  } catch (err) {
    console.error('Welcome greeting failed:', err.message);
  }
});

client.once('clientReady', async () => {
  console.log(`\n🤖 ${client.user.tag} is online and watching for tickets.\n`);
  // Register the /add and /remove slash commands for this server.
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set([
      {
        name: 'add',
        description: 'Add a user to this ticket',
        options: [{ name: 'user', description: 'The user to add', type: ApplicationCommandOptionType.User, required: true }],
      },
      {
        name: 'remove',
        description: 'Remove a user from this ticket',
        options: [{ name: 'user', description: 'The user to remove', type: ApplicationCommandOptionType.User, required: true }],
      },
      {
        name: 'closeticket',
        description: 'Close & delete the current ticket (mods only)',
        defaultMemberPermissions: PermissionFlagsBits.KickMembers,
      },
    ]);
    console.log('   Registered /add, /remove, /closeticket commands.\n');
  } catch (e) {
    console.error('   Could not register slash commands:', e.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'verify_agree') return verifyMember(interaction);
      if (id === 'ticket_open') return openTicket(interaction);
      if (id.startsWith('game_toggle_')) return toggleGame(interaction, id.slice('game_toggle_'.length));
      if (id === 'freekey_link') return sendFreeKeyLink(interaction);
      if (id === 'ticket_close') return closeTicket(interaction);
    } else if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'add') return ticketAddRemove(interaction, true);
      if (interaction.commandName === 'remove') return ticketAddRemove(interaction, false);
      if (interaction.commandName === 'closeticket') return closeTicketCommand(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err.message);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '⚠️ Something went wrong. Please try again.', ...EPHEMERAL }).catch(() => {});
    }
  }
});

// ---------- Rules gate ----------
async function verifyMember(interaction) {
  const role = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE);
  if (!role) {
    return interaction.reply({ content: `⚠️ The **${VERIFIED_ROLE}** role is missing — please let staff know.`, ...EPHEMERAL });
  }
  const member = interaction.member;
  const already = member.roles.cache.has(role.id);
  if (!already) await member.roles.add(role, 'Agreed to the rules');

  // After verifying (or if already verified), let them pick their games — right here.
  const visibleGames = GAMES.filter((g) => !g.hidden);
  const intro = already
    ? "✅ You're verified. Pick or change the games you want to see:"
    : `✅ Thanks for agreeing! You now have the **${role.name}** role. Now pick the games you're interested in:`;
  if (!visibleGames.length) {
    return interaction.reply({ content: intro.replace(/ (Pick|Now pick).*/, ' 🎉'), ...EPHEMERAL });
  }
  const picker = buildGamePicker(visibleGames);
  return interaction.reply({ content: intro, embeds: picker.embeds, components: picker.components, ...EPHEMERAL });
}

// ---------- Tickets ----------
const isTicketChannel = (ch) => ch && ch.topic && ch.topic.startsWith('ticket-owner:');
const ticketOwnerId = (ch) => (isTicketChannel(ch) ? ch.topic.split(':')[1] : null);

const sanitizeName = (username) =>
  username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

// ---------- Game picker ----------
async function toggleGame(interaction, gameKey) {
  const game = gameByKey(gameKey);
  if (!game) return interaction.reply({ content: '⚠️ Unknown game.', ...EPHEMERAL });
  if (game.hidden) return interaction.reply({ content: `🔒 **${game.name}** isn't available yet — stay tuned!`, ...EPHEMERAL });
  // Must be verified first (defense — the picker only appears after verifying).
  const verifiedRole = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE);
  if (verifiedRole && !interaction.member.roles.cache.has(verifiedRole.id)) {
    return interaction.reply({ content: '⚠️ Agree to the rules in #verify first.', ...EPHEMERAL });
  }
  const role = interaction.guild.roles.cache.find((r) => r.name === game.role);
  if (!role) return interaction.reply({ content: `⚠️ The **${game.role}** role is missing — tell staff.`, ...EPHEMERAL });
  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Game picker').catch(() => {});
    return interaction.reply({ content: `➖ Hidden **${game.name}** — click again to show it.`, ...EPHEMERAL });
  }
  await member.roles.add(role, 'Game picker').catch(() => {});
  return interaction.reply({ content: `${game.emoji} Unlocked **${game.name}** — its channels are now visible!`, ...EPHEMERAL });
}

// "Get Free Key" button — privately hand the user the key-page link to copy/open.
// (Discord buttons can't write the clipboard, so we deliver the bare link.)
async function sendFreeKeyLink(interaction) {
  return interaction.reply({
    content: `🔑 Here's your free-key link — tap to open, or press & hold / select it to copy:\n\n${FREE_KEY_URL}`,
    ...EPHEMERAL,
  });
}

const memberIsMod = (member) =>
  member.roles.cache.some((r) => MOD_ROLES.includes(r.name))
  || member.permissions.has(PermissionFlagsBits.Administrator);

// ---------- #key-alerts (kept vault) ----------
// Called IN-PROCESS by the web server when a key is used on a new device.
// Pings the server owner in #key-alerts with the key, HWIDs, and its ticket.
// export: require('./discord-bot/bot').keyUsedAlert({ key, hwid, allHwids })
async function keyUsedAlert({ key, hwid, allHwids } = {}) {
  try {
    if (!client.isReady() || !key) return;
    const guild = await client.guilds.fetch(GUILD_ID);
    let alertCh = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === KEY_ALERTS_CHANNEL);
    if (!alertCh) {
      const fetched = await guild.channels.fetch();
      alertCh = fetched.find((c) => c && c.type === ChannelType.GuildText && c.name === KEY_ALERTS_CHANNEL);
    }
    if (!alertCh) return;
    const rec = findKey(key);
    const msg = buildHwidAlert({
      key, hwid, allHwids,
      ticketChannelId: rec && rec.ticketChannelId,
      userId: rec && rec.userId,
    });
    await alertCh.send({
      content: `<@${guild.ownerId}>`,
      embeds: msg.embeds,
      allowedMentions: { users: [guild.ownerId] },
    });
  } catch (err) {
    console.error('keyUsedAlert failed:', err.message);
  }
}

async function openTicket(interaction) {
  const guild = interaction.guild;
  const opener = interaction.user;

  // Only Support + Moderator can see/handle tickets.
  const staffRoles = guild.roles.cache.filter((r) => TICKET_STAFF_ROLES.includes(r.name));

  // One open ticket per member.
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.topic === `ticket-owner:${opener.id}`
  );
  if (existing) {
    return interaction.reply({ content: `❗ You already have an open ticket: <#${existing.id}>`, ...EPHEMERAL });
  }

  await interaction.deferReply(EPHEMERAL);

  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY
  );

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...staffRoles.map((r) => ({
      id: r.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const safeName = opener.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: category ? category.id : undefined,
    topic: `ticket-owner:${opener.id}`,
    permissionOverwrites: overwrites,
    reason: `Ticket opened by ${opener.tag}`,
  });

  const staffMention = staffRoles.size ? staffRoles.map((r) => `<@&${r.id}>`).join(' ') : 'staff';
  await channel.send(buildTicketWelcome(opener.id, staffMention));

  await interaction.editReply({ content: `✅ Your ticket is ready: <#${channel.id}>` });
}

// /closeticket — mods delete the current support ticket (transcript first).
async function closeTicketCommand(interaction) {
  if (!memberIsMod(interaction.member)) {
    return interaction.reply({ content: '⛔ Only mods can close tickets.', ...EPHEMERAL });
  }
  const channel = interaction.channel;
  if (isTicketChannel(channel)) return closeTicket(interaction); // support: transcript + delete
  return interaction.reply({ content: '⚠️ Run this inside a ticket channel.', ...EPHEMERAL });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return interaction.reply({ content: "This isn't a ticket channel.", ...EPHEMERAL });
  }
  await interaction.reply({ content: '🔒 Closing this ticket and saving the transcript…' });

  const ownerId = ticketOwnerId(channel);
  const messages = await fetchAllMessages(channel);
  const transcript = renderTranscript(channel, messages);
  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
    name: `transcript-${channel.name}.txt`,
  });

  const logChannel = interaction.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === TICKET_LOG_CHANNEL
  );

  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🎫 Ticket closed')
      .addFields(
        { name: 'Ticket', value: `#${channel.name}`, inline: true },
        { name: 'Opened by', value: ownerId ? `<@${ownerId}>` : 'unknown', inline: true },
        { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Messages', value: String(messages.length), inline: true },
        { name: 'Opened', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:f>`, inline: true },
      )
      .setFooter({ text: 'Transcript attached — delete this log once no longer needed.' });
    await logChannel.send({ embeds: [embed], files: [file] }).catch((e) => console.error('Log post failed:', e.message));
  } else {
    console.error(`No #${TICKET_LOG_CHANNEL} channel found — skipping transcript log.`);
  }

  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 4000);
}

// Add or remove a user from the current ticket. add=true adds, false removes.
async function ticketAddRemove(interaction, add) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return interaction.reply({ content: '⚠️ Use this command inside a ticket channel.', ...EPHEMERAL });
  }
  const invoker = interaction.member;
  const isStaff = invoker.roles.cache.some((r) => TICKET_STAFF_ROLES.includes(r.name));
  const ownerId = ticketOwnerId(channel);
  if (!isStaff && invoker.id !== ownerId) {
    return interaction.reply({ content: '⚠️ Only Support/Moderators or the ticket owner can do that.', ...EPHEMERAL });
  }

  const user = interaction.options.getUser('user');
  if (add) {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
    });
    return interaction.reply({ content: `✅ Added <@${user.id}> to this ticket.` });
  }
  if (user.id === ownerId) {
    return interaction.reply({ content: "⚠️ You can't remove the ticket owner.", ...EPHEMERAL });
  }
  await channel.permissionOverwrites.delete(user.id).catch(() => {});
  return interaction.reply({ content: `✅ Removed <@${user.id}> from this ticket.` });
}

// ---------- Transcript helpers ----------
async function fetchAllMessages(channel, cap = 2000) {
  const all = [];
  let before;
  while (all.length < cap) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = [...batch.values()];
    all.push(...arr);
    before = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }
  return all.reverse(); // oldest first
}

function renderTranscript(channel, messages) {
  const header =
    `Transcript for #${channel.name}\n` +
    `Server: ${channel.guild.name}\n` +
    `Closed: ${new Date().toISOString()}\n` +
    `Messages: ${messages.length}\n` +
    '='.repeat(60) + '\n\n';

  const lines = messages.map((m) => {
    const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    const author = `${m.author.tag}${m.author.bot ? ' [BOT]' : ''}`;
    let text = m.content || '';
    if (m.embeds.length) text += (text ? ' ' : '') + `[${m.embeds.length} embed(s)]`;
    if (m.attachments.size) {
      text += '\n    ' + [...m.attachments.values()].map((a) => `📎 ${a.name}: ${a.url}`).join('\n    ');
    }
    return `[${time}] ${author}: ${text}`;
  });

  return header + lines.join('\n') + '\n';
}

// Start the bot. Safe to call from another process (e.g. the web server) —
// it never calls process.exit, so a bot problem can't take the site down.
function startBot() {
  if (!DISCORD_TOKEN) {
    console.warn('⚠️  DISCORD_TOKEN not set — Discord bot not started.');
    return;
  }
  client.login(DISCORD_TOKEN).catch((e) => {
    console.error('❌ Discord bot could not log in:', e.message);
  });
}

module.exports = { startBot, keyUsedAlert };

// Run directly (`node bot.js`) for local/standalone use.
if (require.main === module) startBot();
