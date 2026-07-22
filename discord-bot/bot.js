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
  WELCOME_CHANNEL, FREE_KEY_TTL_HOURS, FREE_KEY_SAFE_CHANNEL, FREE_KEY_TICKET_CATEGORY,
  PREMIUM_KEY_SAFE_CHANNEL, PREMIUM_KEY_DEFAULT_LENGTH,
  PREMIUM_KEY_MIN_LENGTH, PREMIUM_KEY_MAX_LENGTH, KEY_ALERTS_CHANNEL, GAMES,
} = require('./config');
const { buildTicketWelcome } = require('./ticket-panel');
const { buildWelcomeGreeting } = require('./welcome');
const {
  generateKey, generateFreeKey, generatePremiumKey, addKey, updateKey, getKeys, findKey, latestKeyForUser,
  buildKeyTicketMessage, buildSafeEntry, buildPremiumKeyMessage, buildPremiumSafeEntry,
  buildHwidAlert,
} = require('./freekey');

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
        name: 'premiumkey',
        description: 'Generate a permanent premium key (mods only)',
        defaultMemberPermissions: PermissionFlagsBits.KickMembers, // hides it from non-mods
        options: [
          {
            name: 'length',
            description: `Number of digits in the key (default ${PREMIUM_KEY_DEFAULT_LENGTH})`,
            type: ApplicationCommandOptionType.Integer,
            required: false,
            minValue: PREMIUM_KEY_MIN_LENGTH,
            maxValue: PREMIUM_KEY_MAX_LENGTH,
          },
          {
            name: 'bind',
            description: 'Lock the key to the first device (default false)',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'revoke',
        description: 'Revoke (disable) a key (mods only)',
        defaultMemberPermissions: PermissionFlagsBits.KickMembers,
        options: [{ name: 'key', description: 'The key to revoke', type: ApplicationCommandOptionType.String, required: true }],
      },
      {
        name: 'hwidbind',
        description: 'Turn a key\'s HWID lock on or off (mods only)',
        defaultMemberPermissions: PermissionFlagsBits.KickMembers,
        options: [
          { name: 'key', description: 'The key', type: ApplicationCommandOptionType.String, required: true },
          { name: 'on', description: 'true = lock to device, false = unlock', type: ApplicationCommandOptionType.Boolean, required: true },
        ],
      },
    ]);
    console.log('   Registered /add, /remove, /premiumkey, /revoke, /hwidbind commands.\n');
  } catch (e) {
    console.error('   Could not register slash commands:', e.message);
  }

  // Re-arm free-key expiry timers that were saved before the last restart.
  let armed = 0;
  for (const rec of getKeys()) {
    if (rec.status === 'expired') continue;
    if (rec.expiresAt <= Date.now()) expireKey(rec);
    else { scheduleExpiry(rec); armed++; }
  }
  if (armed) console.log(`   Re-armed ${armed} free-key timer(s).\n`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'verify_agree') return verifyMember(interaction);
      if (id === 'ticket_open') return openTicket(interaction);
      if (id.startsWith('game_toggle_')) return toggleGame(interaction, id.slice('game_toggle_'.length));
      if (id.startsWith('freekey_request_')) return requestFreeKey(interaction, id.slice('freekey_request_'.length));
      if (id === 'freekey_request') return requestFreeKey(interaction, 'prior'); // legacy old panel → Prior
      if (id === 'freekey_new') return newFreeKey(interaction);
      if (id === 'ticket_close') return closeTicket(interaction);
    } else if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'add') return ticketAddRemove(interaction, true);
      if (interaction.commandName === 'remove') return ticketAddRemove(interaction, false);
      if (interaction.commandName === 'premiumkey') return grantPremiumKey(interaction);
      if (interaction.commandName === 'revoke') return revokeKeyCommand(interaction);
      if (interaction.commandName === 'hwidbind') return hwidBindCommand(interaction);
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
  if (member.roles.cache.has(role.id)) {
    return interaction.reply({ content: "✅ You're already verified — you have full access!", ...EPHEMERAL });
  }
  await member.roles.add(role, 'Agreed to the rules');
  return interaction.reply({
    content: `✅ Thanks for agreeing! You now have the **${role.name}** role and full access to the server. Welcome aboard! 🎉`,
    ...EPHEMERAL,
  });
}

// ---------- Tickets ----------
const isTicketChannel = (ch) => ch && ch.topic && ch.topic.startsWith('ticket-owner:');
const ticketOwnerId = (ch) => (isTicketChannel(ch) ? ch.topic.split(':')[1] : null);

const sanitizeName = (username) =>
  username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

// ---------- Free key generator ----------

// The EazyCheats site exposes POST /api/keys to register a key for validation.
const KEY_API_URL = process.env.KEY_API_URL || 'https://eazycheats.com/api/keys';

// Register a generated key with the site's key API. Best-effort: never throws,
// so a slow/down/not-yet-deployed API can't block issuing the key in Discord.
async function registerKeyWithApi(key, hours, discordId, note = 'discord free key', bindHwid, product) {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) {
    console.warn('BOT_API_SECRET not set — key not registered with the API (Discord-only).');
    return;
  }
  const payload = { key, hours, discord_id: discordId, note };
  if (bindHwid === true || bindHwid === false) payload.bind_hwid = bindHwid;
  if (product) payload.product = product; // game tag so the site can game-lock the key
  try {
    const res = await fetch(KEY_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': secret },
      body: JSON.stringify(payload),
    });
    if (res.ok) console.log(`Registered key with API: ${key}`);
    else {
      const body = await res.text().catch(() => '');
      console.error(`Key API returned ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('Key API call failed:', err.message);
  }
}

// Call a key-API sub-route (revoke / hwid). Returns {ok, data} best-effort.
async function callKeyApi(subpath, payload) {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) { console.warn('BOT_API_SECRET not set — cannot call key API.'); return { ok: false }; }
  try {
    const res = await fetch(KEY_API_URL + subpath, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': secret },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`Key API ${subpath} returned ${res.status}:`, JSON.stringify(data).slice(0, 200));
    return { ok: res.ok, data };
  } catch (err) {
    console.error(`Key API ${subpath} call failed:`, err.message);
    return { ok: false };
  }
}

// Free-key ticket topic: `freekey-owner:<gameKey>:<userId>`.
const isFreeKeyChannel = (ch) => ch && ch.topic && ch.topic.startsWith('freekey-owner:');
const freeKeyParts = (ch) => (isFreeKeyChannel(ch) ? ch.topic.split(':') : []); // [ , gameKey, userId]
const freeKeyOwnerId = (ch) => freeKeyParts(ch)[2] || null;
const freeKeyGameKey = (ch) => freeKeyParts(ch)[1] || null;

// ---------- Game picker ----------
async function toggleGame(interaction, gameKey) {
  const game = gameByKey(gameKey);
  if (!game) return interaction.reply({ content: '⚠️ Unknown game.', ...EPHEMERAL });
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

// Generate a game key, register it, post it in the ticket, log it, persist, and
// schedule expiry. All sends are silent so nobody gets pinged.
async function issueKey(guild, channel, userId, game) {
  const key = generateFreeKey(game.keyPrefix);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + FREE_KEY_TTL_HOURS * 60 * 60 * 1000;

  // Register the key with the site, tagged with the game so it can be game-locked.
  await registerKeyWithApi(key, FREE_KEY_TTL_HOURS, userId, `${game.name} free key`, undefined, game.key);

  await channel.send({ ...buildKeyTicketMessage(key, userId, expiresAt), flags: SILENT }).catch(() => {});

  const safe = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === FREE_KEY_SAFE_CHANNEL
  );
  let safeMsg = null;
  if (safe) {
    safeMsg = await safe.send({
      ...buildSafeEntry({ key, userId, ticketChannelId: channel.id, issuedAtMs: issuedAt, expiresAtMs: expiresAt, status: 'active', gameName: game.name }),
      flags: SILENT,
    }).catch(() => null);
  }

  const rec = {
    key, userId, game: game.key, gameName: game.name, ticketChannelId: channel.id,
    safeChannelId: safe ? safe.id : null, safeMessageId: safeMsg ? safeMsg.id : null,
    issuedAt, expiresAt, status: 'active',
  };
  addKey(rec);
  scheduleExpiry(rec);
  return rec;
}

async function requestFreeKey(interaction, gameKey) {
  const guild = interaction.guild;
  const opener = interaction.user;
  const game = gameByKey(gameKey);
  if (!game) return interaction.reply({ content: '⚠️ Unknown game.', ...EPHEMERAL });
  await interaction.deferReply(EPHEMERAL);

  // One free-key ticket per person PER GAME — point them back to their existing one.
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.topic === `freekey-owner:${game.key}:${opener.id}`
  );
  if (existing) {
    return interaction.editReply({
      content: `❗ You already have a ${game.name} free-key ticket: <#${existing.id}> — use the **Get New Key** button there when your key expires.`,
    });
  }

  // Only the requester + mods can see a free-key ticket.
  const modRoles = guild.roles.cache.filter((r) => MOD_ROLES.includes(r.name));
  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === FREE_KEY_TICKET_CATEGORY
  );

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: opener.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...modRoles.map((r) => ({
      id: r.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: `${game.prefix}-fk-${sanitizeName(opener.username)}`,
    type: ChannelType.GuildText,
    parent: category ? category.id : undefined,
    topic: `freekey-owner:${game.key}:${opener.id}`,
    permissionOverwrites: overwrites,
    reason: `${game.name} free key requested by ${opener.tag}`,
  });

  await issueKey(guild, channel, opener.id, game);
  await interaction.editReply({ content: `✅ Your ${game.name} free key is ready in <#${channel.id}>!` });
}

// "Get New Key" button — only the owner, and only once their current key expired.
async function newFreeKey(interaction) {
  const ownerId = freeKeyOwnerId(interaction.channel);
  const game = gameByKey(freeKeyGameKey(interaction.channel));
  if (!ownerId || !game) {
    return interaction.reply({ content: 'This button only works inside a free-key ticket.', ...EPHEMERAL });
  }
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: '⛔ Only the ticket owner can request a new key here.', ...EPHEMERAL });
  }
  const latest = latestKeyForUser(ownerId, game.key);
  if (latest && latest.status !== 'expired' && latest.expiresAt > Date.now()) {
    return interaction.reply({
      content: `⏳ Your current key is still active — it expires <t:${Math.floor(latest.expiresAt / 1000)}:R>. Come back then for a new one.`,
      ...EPHEMERAL,
    });
  }
  await interaction.deferReply(EPHEMERAL);
  await issueKey(interaction.guild, interaction.channel, ownerId, game);
  await interaction.editReply({ content: '✅ A fresh key has been posted above.' });
}

function scheduleExpiry(rec) {
  const delay = Math.max(0, rec.expiresAt - Date.now());
  setTimeout(() => expireKey(rec), delay);
}

async function expireKey(rec) {
  try {
    updateKey(rec.key, { status: 'expired' });
    if (rec.safeChannelId && rec.safeMessageId) {
      const ch = await client.channels.fetch(rec.safeChannelId).catch(() => null);
      const msg = ch && await ch.messages.fetch(rec.safeMessageId).catch(() => null);
      if (msg) {
        await msg.edit(buildSafeEntry({
          key: rec.key, userId: rec.userId, ticketChannelId: rec.ticketChannelId,
          issuedAtMs: rec.issuedAt, expiresAtMs: rec.expiresAt, status: 'expired', gameName: rec.gameName,
        })).catch(() => {});
      }
    }
    const tch = await client.channels.fetch(rec.ticketChannelId).catch(() => null);
    if (tch) {
      tch.send({
        content: '⏰ This free key has now **expired** — press **Get New Key** above for a fresh one.',
        flags: SILENT,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('expireKey failed:', err.message);
  }
}

// ---------- Premium key (mod command) ----------
async function grantPremiumKey(interaction) {
  const member = interaction.member;
  const isMod = member.roles.cache.some((r) => MOD_ROLES.includes(r.name))
    || member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isMod) {
    return interaction.reply({ content: '⛔ Only mods can generate premium keys.', ...EPHEMERAL });
  }

  const length = interaction.options.getInteger('length') ?? PREMIUM_KEY_DEFAULT_LENGTH;
  const bind = interaction.options.getBoolean('bind') ?? false;
  const key = generatePremiumKey(length);
  const issuedAt = Date.now();

  // Register the permanent key (hours: 0 = never expires) with the site key API.
  await registerKeyWithApi(key, 0, null, `premium key by ${interaction.user.tag}`, bind);

  // Post the key publicly in the channel where the command was run.
  await interaction.reply(buildPremiumKeyMessage(key, interaction.user.id));

  // Archive it in #premium-key-safe (unless the command was already run there).
  const safe = interaction.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === PREMIUM_KEY_SAFE_CHANNEL
  );
  if (safe && safe.id !== interaction.channelId) {
    await safe.send(buildPremiumSafeEntry(key, interaction.user.id, issuedAt)).catch(() => {});
  }
}

const memberIsMod = (member) =>
  member.roles.cache.some((r) => MOD_ROLES.includes(r.name))
  || member.permissions.has(PermissionFlagsBits.Administrator);

// ---------- /revoke ----------
async function revokeKeyCommand(interaction) {
  if (!memberIsMod(interaction.member)) {
    return interaction.reply({ content: '⛔ Only mods can revoke keys.', ...EPHEMERAL });
  }
  const key = interaction.options.getString('key').trim();
  const { ok, data } = await callKeyApi('/revoke', { key });
  if (ok && data && data.revoked) {
    return interaction.reply({ content: `✅ Revoked \`${key}\` — it will no longer validate.` });
  }
  if (ok) {
    return interaction.reply({ content: `⚠️ No active key matched \`${key}\` (nothing to revoke).`, ...EPHEMERAL });
  }
  return interaction.reply({ content: `❌ Couldn't reach the key API to revoke \`${key}\` (see logs).`, ...EPHEMERAL });
}

// ---------- /hwidbind ----------
async function hwidBindCommand(interaction) {
  if (!memberIsMod(interaction.member)) {
    return interaction.reply({ content: '⛔ Only mods can change HWID lock.', ...EPHEMERAL });
  }
  const key = interaction.options.getString('key').trim();
  const on = interaction.options.getBoolean('on');
  const { ok } = await callKeyApi('/hwid', { key, bind_hwid: on });
  if (ok) {
    return interaction.reply({ content: `✅ HWID lock **${on ? 'ON' : 'OFF'}** for \`${key}\`.` });
  }
  return interaction.reply({
    content: `❌ Couldn't update HWID lock for \`${key}\` — is the /api/keys/hwid endpoint live? (see logs)`,
    ...EPHEMERAL,
  });
}

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
