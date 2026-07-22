// ===================================================================
//  setup.js — builds the whole server from config.js
//  Run with: npm run setup
//  Safe to run repeatedly: creates what's missing, refreshes permissions,
//  and never deletes.
// ===================================================================
require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const {
  ROLES, STAFF_ROLES, TICKET_STAFF_ROLES, MOD_ROLES, RULES, CATEGORIES,
  TICKET_CATEGORY, FREE_KEY_TICKET_CATEGORY,
  GAMES, GAME_CHANNELS, SUGGESTION_TAGS,
} = require('./config');
const { buildTicketPanel, buildGamePicker, buildFreeKeyPanel, buildStaffCommandsInfo } = require('./ticket-panel');
const { buildVerifyPanel } = require('./verify-panel');
const { buildWelcomeInfo } = require('./welcome');

const { DISCORD_TOKEN, GUILD_ID } = process.env;

function fail(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}
if (!DISCORD_TOKEN) fail('DISCORD_TOKEN is missing from .env');
if (!GUILD_ID) fail('GUILD_ID is missing from .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Turn an array of permission names into a bitfield.
const toPerms = (names) => names.map((n) => PermissionFlagsBits[n]);

const P = PermissionFlagsBits;

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`\n🔧 Setting up: ${guild.name}\n`);

    // -------- 1. ROLES --------
    const roleByName = {};
    const existingRoles = await guild.roles.fetch();
    // Create roles in reverse so the first in config ends up highest.
    for (const def of [...ROLES].reverse()) {
      let role = existingRoles.find((r) => r.name === def.name);
      if (role) {
        console.log(`  = role exists: ${def.name}`);
      } else {
        role = await guild.roles.create({
          name: def.name,
          colors: { primaryColor: def.color },
          hoist: def.hoist,
          mentionable: def.mentionable,
          permissions: toPerms(def.perms),
          reason: 'EazyCheats auto-setup',
        });
        console.log(`  + created role: ${def.name}`);
      }
      roleByName[def.name] = role;
    }

    const everyone = guild.roles.everyone;

    // Stop regular members from creating threads (server-wide).
    const noThreadPerms = everyone.permissions.remove([
      P.CreatePublicThreads, P.CreatePrivateThreads,
    ]);
    if (!everyone.permissions.equals(noThreadPerms)) {
      await everyone.setPermissions(noThreadPerms, 'EazyCheats: disable member threads');
      console.log('  ~ disabled thread creation for @everyone');
    }

    const staffRoleObjs = STAFF_ROLES.map((n) => roleByName[n]).filter(Boolean);
    const ticketStaffObjs = TICKET_STAFF_ROLES.map((n) => roleByName[n]).filter(Boolean);
    const modRoleObjs = MOD_ROLES.map((n) => roleByName[n]).filter(Boolean);
    const freeUser = roleByName['Free User'];
    const customer = roleByName['Customer'];

    const STAFF_ALLOW = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak, P.AddReactions];

    // Build permission overwrites for a channel/category from its access level.
    //   public      -> everyone can view (read-only gate). Staff can post.
    //   member      -> Free User + Customer + staff can view/talk. Others: hidden.
    //   customer    -> Customer + staff only.
    //   staff       -> all staff roles only.
    //   ticketstaff -> only the ticket-staff roles (Support + Moderator).
    function overwritesFor(access, readonly, isVoice, isForum) {
      const ow = [];
      // Forums need post-creation + reply perms (post creation uses SendMessages;
      // these override the server-wide "no member threads" rule for this channel).
      const forumExtra = isForum ? [P.SendMessagesInThreads, P.CreatePublicThreads] : [];
      const textAllow = readonly ? [P.ViewChannel, P.ReadMessageHistory]
        : [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions, ...forumExtra];
      const voiceAllow = [P.ViewChannel, P.Connect, P.Speak];
      const allowFor = isVoice ? voiceAllow : textAllow;
      const staffAllow = isForum ? [...STAFF_ALLOW, ...forumExtra] : STAFF_ALLOW;

      if (access === 'public') {
        // Visible to everyone; read-only for non-staff.
        ow.push({ id: everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] });
        for (const sr of staffRoleObjs) ow.push({ id: sr.id, allow: staffAllow });
        return ow;
      }

      // Everyone else: hide it. Also deny send so read-only grants stick.
      const everyoneDeny = [P.ViewChannel];
      if (isVoice) everyoneDeny.push(P.Connect);
      if (readonly) everyoneDeny.push(P.SendMessages);
      ow.push({ id: everyone.id, deny: everyoneDeny });

      if (access === 'ticketstaff') {
        // ONLY Support + Moderator — not all staff (Dev is excluded).
        for (const sr of ticketStaffObjs) ow.push({ id: sr.id, allow: staffAllow });
        return ow;
      }

      if (access === 'modonly') {
        // ONLY the "mods" (Moderator) — the key system.
        for (const sr of modRoleObjs) ow.push({ id: sr.id, allow: staffAllow });
        return ow;
      }

      if (access === 'member') {
        if (freeUser) ow.push({ id: freeUser.id, allow: allowFor });
        if (customer) ow.push({ id: customer.id, allow: allowFor });
      } else if (access === 'customer') {
        if (customer) ow.push({ id: customer.id, allow: allowFor });
      }
      // member / customer / staff: all staff can see + talk.
      for (const sr of staffRoleObjs) ow.push({ id: sr.id, allow: staffAllow });
      return ow;
    }

    // Overwrites for a game channel: hidden from @everyone; the game role can
    // view (+ talk unless readonly); all staff can see + moderate.
    function gameOverwrites(roleObj, readonly, isForum) {
      const ow = [];
      const forumExtra = isForum ? [P.SendMessagesInThreads, P.CreatePublicThreads] : [];
      const everyoneDeny = readonly ? [P.ViewChannel, P.SendMessages] : [P.ViewChannel];
      ow.push({ id: everyone.id, deny: everyoneDeny });
      const allow = readonly ? [P.ViewChannel, P.ReadMessageHistory, ...forumExtra]
        : [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions, ...forumExtra];
      if (roleObj) ow.push({ id: roleObj.id, allow });
      const staffAllow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak, P.AddReactions, ...forumExtra];
      for (const sr of staffRoleObjs) ow.push({ id: sr.id, allow: staffAllow });
      return ow;
    }

    // -------- 2. CATEGORIES + CHANNELS --------
    const allChannels = await guild.channels.fetch();
    const findChannel = (name, type) =>
      allChannels.find((c) => c && c.name === name && c.type === type);

    async function ensureCategory(name, access) {
      const ow = overwritesFor(access, false, true);
      let cat = findChannel(name, ChannelType.GuildCategory);
      if (cat) {
        await cat.permissionOverwrites.set(ow, 'EazyCheats auto-setup');
        console.log(`  = category exists (perms refreshed): ${name}`);
      } else {
        cat = await guild.channels.create({
          name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: ow,
          reason: 'EazyCheats auto-setup',
        });
        console.log(`  + created category: ${name}`);
      }
      return cat;
    }

    let ticketPanelChannel = null;
    let verifyPanelChannel = null;
    let welcomeInfoChannel = null;
    let gamePickerChannel = null;
    let staffCommandsChannel = null;

    for (const catDef of CATEGORIES) {
      const category = await ensureCategory(catDef.name, catDef.access);
      for (const ch of catDef.channels) {
        const access = ch.access || catDef.access;
        const isVoice = ch.type === 'voice';
        const isForum = ch.type === 'forum';
        const type = isVoice ? ChannelType.GuildVoice
          : isForum ? ChannelType.GuildForum : ChannelType.GuildText;
        const ow = overwritesFor(access, ch.readonly, isVoice, isForum);
        let channel = findChannel(ch.name, type);

        if (channel) {
          if (channel.parentId !== category.id) {
            await channel.setParent(category.id, { lockPermissions: false });
            console.log(`    ~ moved into ${catDef.name}: ${ch.name}`);
          }
          await channel.permissionOverwrites.set(ow, 'EazyCheats auto-setup');
          console.log(`    = channel exists (perms refreshed): ${ch.name}`);
        } else {
          const opts = {
            name: ch.name,
            type,
            parent: category.id,
            permissionOverwrites: ow,
            reason: 'EazyCheats auto-setup',
          };
          if (!isVoice) opts.topic = ch.topic;
          if (isForum && ch.forum) {
            if (ch.forum.tags) opts.availableTags = ch.forum.tags;
            if (ch.forum.defaultReaction) opts.defaultReactionEmoji = { name: ch.forum.defaultReaction };
          }
          channel = await guild.channels.create(opts);
          console.log(`    + created ${isForum ? 'forum' : isVoice ? 'voice' : 'text'} channel: ${ch.name}`);
        }
        if (ch.ticketPanel) ticketPanelChannel = channel;
        if (ch.verifyPanel) verifyPanelChannel = channel;
        if (ch.welcomeInfo) welcomeInfoChannel = channel;
        if (ch.gamePicker) gamePickerChannel = channel;
        if (ch.staffCommands) staffCommandsChannel = channel;
      }
    }

    // Category that will hold live ticket channels (Support + Moderator only).
    await ensureCategory(TICKET_CATEGORY, 'ticketstaff');
    // Category that holds live free-key tickets (mods only).
    await ensureCategory(FREE_KEY_TICKET_CATEGORY, 'modonly');

    // Helpers to dedupe an existing panel by button id or by embed title.
    const hasButton = (id) => (m) =>
      m.components?.some((row) => row.components?.some((c) => c.customId === id));
    const hasEmbedTitle = (title) => (m) =>
      m.embeds?.some((e) => e.title && e.title.includes(title));

    // Post a panel only if one isn't already there.
    async function ensurePanel(channel, matches, build, label) {
      if (!channel) return;
      const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      const already = recent && recent.find((m) => m.author.id === client.user.id && matches(m));
      if (already) console.log(`  = ${label} already posted in #${channel.name}`);
      else { await channel.send(build()); console.log(`  + posted ${label} in #${channel.name}`); }
    }

    // -------- GAME SECTIONS (role-gated category + same channels per game) --------
    console.log('');
    for (const game of GAMES) {
      const roleObj = roleByName[game.role];
      const catOw = gameOverwrites(roleObj, false, true);
      let cat = findChannel(game.category, ChannelType.GuildCategory);
      if (cat) {
        await cat.permissionOverwrites.set(catOw, 'EazyCheats game setup');
        console.log(`  = game category exists: ${game.category}`);
      } else {
        cat = await guild.channels.create({ name: game.category, type: ChannelType.GuildCategory, permissionOverwrites: catOw, reason: 'EazyCheats game setup' });
        console.log(`  + created game category: ${game.category}`);
      }

      for (const tmpl of GAME_CHANNELS) {
        const name = `${game.prefix}-${tmpl.suffix}`;
        const isForum = tmpl.type === 'forum';
        const type = isForum ? ChannelType.GuildForum : ChannelType.GuildText;
        const ow = gameOverwrites(roleObj, tmpl.readonly, isForum);
        let channel = findChannel(name, type);
        // Adopt an existing channel (rename in place) if configured — keeps messages.
        if (!channel && game.renameFrom && game.renameFrom[tmpl.suffix]) {
          const old = findChannel(game.renameFrom[tmpl.suffix], type);
          if (old) { await old.setName(name).catch(() => {}); channel = old; console.log(`    ~ renamed #${game.renameFrom[tmpl.suffix]} -> #${name}`); }
        }
        if (channel) {
          if (channel.parentId !== cat.id) await channel.setParent(cat.id, { lockPermissions: false }).catch(() => {});
          await channel.permissionOverwrites.set(ow, 'EazyCheats game setup');
          console.log(`    = game channel: #${name}`);
        } else {
          const opts = { name, type, parent: cat.id, permissionOverwrites: ow, reason: 'EazyCheats game setup' };
          if (isForum) {
            opts.topic = `${game.name} suggestions — one idea per post, tag it, and 👍 the ones you want.`;
            opts.availableTags = SUGGESTION_TAGS;
            opts.defaultReactionEmoji = { name: '👍' };
          } else {
            opts.topic = `${game.name} — ${tmpl.suffix}.`;
          }
          channel = await guild.channels.create(opts);
          console.log(`    + created game ${isForum ? 'forum' : 'channel'}: #${name}`);
        }
        if (tmpl.freekeyPanel && !game.hidden) {
          await ensurePanel(channel, hasButton(`freekey_request_${game.key}`), () => buildFreeKeyPanel(game), `${game.name} free-key panel`);
        }
      }
      // Position each game category near the top (after INFORMATION + SUPPORT).
      await cat.setPosition(2 + GAMES.indexOf(game)).catch(() => {});
    }

    // Pin the key-system categories to the very bottom of the channel list.
    async function moveToBottom(name) {
      const fresh = await guild.channels.fetch();
      const cat = fresh.find((c) => c && c.type === ChannelType.GuildCategory && c.name === name);
      if (cat) { await cat.setPosition(999).catch(() => {}); console.log(`  ~ pinned to bottom: ${name}`); }
    }
    for (const catDef of CATEGORIES) if (catDef.bottom) await moveToBottom(catDef.name);
    await moveToBottom(FREE_KEY_TICKET_CATEGORY);

    // -------- PANELS --------
    console.log('');

    // The rules gate lives ONLY in #verify — remove any stray gate in #welcome.
    if (welcomeInfoChannel && verifyPanelChannel && welcomeInfoChannel.id !== verifyPanelChannel.id) {
      const msgs = await welcomeInfoChannel.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const m of msgs.values()) {
        if (m.author.id === client.user.id && hasButton('verify_agree')(m)) { await m.delete().catch(() => {}); console.log('  ~ removed stray rules gate from #welcome'); }
      }
    }

    await ensurePanel(welcomeInfoChannel, hasEmbedTitle('Welcome to EazyCheats!'), () => buildWelcomeInfo(verifyPanelChannel), 'welcome intro');
    await ensurePanel(verifyPanelChannel, hasButton('verify_agree'), () => buildVerifyPanel(RULES), 'rules gate panel');
    // Picker only lists released games. Remove a stale picker that still shows a hidden one.
    const visibleGames = GAMES.filter((g) => !g.hidden);
    const hiddenGameBtns = GAMES.filter((g) => g.hidden).map((g) => `game_toggle_${g.key}`);
    if (gamePickerChannel && hiddenGameBtns.length) {
      const msgs = await gamePickerChannel.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const m of msgs.values()) {
        if (m.author.id === client.user.id && hiddenGameBtns.some((id) => hasButton(id)(m))) { await m.delete().catch(() => {}); console.log('  ~ removed stale game picker (listed a hidden game)'); }
      }
    }
    const pickerOk = (m) => visibleGames.every((g) => hasButton(`game_toggle_${g.key}`)(m)) && !hiddenGameBtns.some((id) => hasButton(id)(m));
    await ensurePanel(gamePickerChannel, pickerOk, () => buildGamePicker(visibleGames), 'game picker');
    await ensurePanel(staffCommandsChannel, hasEmbedTitle('Staff Commands'), () => buildStaffCommandsInfo(), 'staff commands list');

    // The ticket panel dropped its free-key button — remove the old version so
    // the support-only panel gets posted.
    if (ticketPanelChannel) {
      const msgs = await ticketPanelChannel.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const m of msgs.values()) {
        if (m.author.id === client.user.id && hasButton('freekey_request')(m)) { await m.delete().catch(() => {}); console.log('  ~ removed old ticket panel (had free-key button)'); }
      }
    }
    await ensurePanel(ticketPanelChannel, (m) => hasButton('ticket_open')(m) && !hasButton('freekey_request')(m), () => buildTicketPanel(), 'ticket panel');

    console.log('\n✅ Server setup complete!\n');
    console.log('   New members are greeted in #welcome and must click "Agree to the Rules" in #verify.');
    console.log('   Keep "npm start" running so greetings, the Agree button, and tickets work.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    if (err.code === 50013) {
      console.error('   The bot is missing permissions. Make sure it has the');
      console.error('   Administrator permission and its role is near the top of the list.');
    }
    process.exit(1);
  }
});

client.login(DISCORD_TOKEN).catch((e) =>
  fail('Could not log in. Is DISCORD_TOKEN correct?  (' + e.message + ')')
);
