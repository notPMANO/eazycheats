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
} = require('./config');
const { buildTicketPanel } = require('./ticket-panel');
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
    function overwritesFor(access, readonly, isVoice) {
      const ow = [];
      const textAllow = readonly ? [P.ViewChannel, P.ReadMessageHistory]
        : [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions];
      const voiceAllow = [P.ViewChannel, P.Connect, P.Speak];
      const allowFor = isVoice ? voiceAllow : textAllow;

      if (access === 'public') {
        // Visible to everyone; read-only for non-staff.
        ow.push({ id: everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] });
        for (const sr of staffRoleObjs) ow.push({ id: sr.id, allow: STAFF_ALLOW });
        return ow;
      }

      // Everyone else: hide it. Also deny send so read-only grants stick.
      const everyoneDeny = [P.ViewChannel];
      if (isVoice) everyoneDeny.push(P.Connect);
      if (readonly) everyoneDeny.push(P.SendMessages);
      ow.push({ id: everyone.id, deny: everyoneDeny });

      if (access === 'ticketstaff') {
        // ONLY Support + Moderator — not all staff (Dev is excluded).
        for (const sr of ticketStaffObjs) ow.push({ id: sr.id, allow: STAFF_ALLOW });
        return ow;
      }

      if (access === 'modonly') {
        // ONLY the "mods" (Moderator) — the key system.
        for (const sr of modRoleObjs) ow.push({ id: sr.id, allow: STAFF_ALLOW });
        return ow;
      }

      if (access === 'member') {
        if (freeUser) ow.push({ id: freeUser.id, allow: allowFor });
        if (customer) ow.push({ id: customer.id, allow: allowFor });
      } else if (access === 'customer') {
        if (customer) ow.push({ id: customer.id, allow: allowFor });
      }
      // member / customer / staff: all staff can see + talk.
      for (const sr of staffRoleObjs) ow.push({ id: sr.id, allow: STAFF_ALLOW });
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

    for (const catDef of CATEGORIES) {
      const category = await ensureCategory(catDef.name, catDef.access);
      for (const ch of catDef.channels) {
        const access = ch.access || catDef.access;
        const isVoice = ch.type === 'voice';
        const type = isVoice ? ChannelType.GuildVoice : ChannelType.GuildText;
        const ow = overwritesFor(access, ch.readonly, isVoice);
        let channel = findChannel(ch.name, type);

        if (channel) {
          if (channel.parentId !== category.id) {
            await channel.setParent(category.id, { lockPermissions: false });
            console.log(`    ~ moved into ${catDef.name}: ${ch.name}`);
          }
          await channel.permissionOverwrites.set(ow, 'EazyCheats auto-setup');
          console.log(`    = channel exists (perms refreshed): ${ch.name}`);
        } else {
          channel = await guild.channels.create({
            name: ch.name,
            type,
            parent: category.id,
            topic: isVoice ? undefined : ch.topic,
            permissionOverwrites: ow,
            reason: 'EazyCheats auto-setup',
          });
          console.log(`    + created ${isVoice ? 'voice' : 'text'} channel: ${ch.name}`);
        }
        if (ch.ticketPanel) ticketPanelChannel = channel;
        if (ch.verifyPanel) verifyPanelChannel = channel;
        if (ch.welcomeInfo) welcomeInfoChannel = channel;
      }
    }

    // Category that will hold live ticket channels (Support + Moderator only).
    await ensureCategory(TICKET_CATEGORY, 'ticketstaff');
    // Category that holds live free-key tickets (mods only).
    await ensureCategory(FREE_KEY_TICKET_CATEGORY, 'modonly');

    // Pin the key-system categories to the very bottom of the channel list.
    async function moveToBottom(name) {
      const fresh = await guild.channels.fetch();
      const cat = fresh.find((c) => c && c.type === ChannelType.GuildCategory && c.name === name);
      if (cat) { await cat.setPosition(999).catch(() => {}); console.log(`  ~ pinned to bottom: ${name}`); }
    }
    for (const catDef of CATEGORIES) if (catDef.bottom) await moveToBottom(catDef.name);
    await moveToBottom(FREE_KEY_TICKET_CATEGORY); // free-key tickets sit at the very bottom

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
      if (already) {
        console.log(`  = ${label} already posted in #${channel.name}`);
      } else {
        await channel.send(build());
        console.log(`  + posted ${label} in #${channel.name}`);
      }
    }

    // -------- 3. PANELS --------
    console.log('');

    // The rules gate now lives ONLY in #verify — remove any stray gate that
    // used to be posted in #welcome.
    if (welcomeInfoChannel && verifyPanelChannel && welcomeInfoChannel.id !== verifyPanelChannel.id) {
      const msgs = await welcomeInfoChannel.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) {
        for (const m of msgs.values()) {
          if (m.author.id === client.user.id && hasButton('verify_agree')(m)) {
            await m.delete().catch(() => {});
            console.log('  ~ removed stray rules gate from #welcome');
          }
        }
      }
    }

    await ensurePanel(welcomeInfoChannel, hasEmbedTitle('Welcome to EazyCheats!'), () => buildWelcomeInfo(verifyPanelChannel), 'welcome intro');
    await ensurePanel(verifyPanelChannel, hasButton('verify_agree'), () => buildVerifyPanel(RULES), 'rules gate panel');

    // The ticket panel gained a second button (Request Free Key) — remove any
    // old single-button panel so it gets re-posted with both buttons.
    if (ticketPanelChannel) {
      const msgs = await ticketPanelChannel.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) {
        for (const m of msgs.values()) {
          if (m.author.id === client.user.id && hasButton('ticket_open')(m) && !hasButton('freekey_request')(m)) {
            await m.delete().catch(() => {});
            console.log('  ~ removed outdated ticket panel (single button)');
          }
        }
      }
    }
    await ensurePanel(ticketPanelChannel, hasButton('freekey_request'), () => buildTicketPanel(), 'ticket panel');

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
