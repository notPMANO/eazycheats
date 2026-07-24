// ===================================================================
//  EazyCheats server blueprint
//  Edit anything here and re-run `npm run setup` to apply changes.
//  (Setup is safe to run repeatedly — it never duplicates or deletes.)
// ===================================================================

// --- ROLES (top of the list = highest in the hierarchy) ---
// hoist  = show members separately in the sidebar
// perms  = extra permissions granted to the role
const ROLES = [
  {
    name: 'Moderator',
    color: 0xe74c3c, // red
    hoist: true,
    mentionable: true,
    perms: [
      'ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers',
      'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ManageNicknames',
      'ManageThreads', 'CreatePublicThreads', 'CreatePrivateThreads', 'ViewAuditLog',
    ],
  },
  {
    name: 'Dev',
    color: 0x2ecc71, // green
    hoist: true,
    mentionable: true,
    perms: ['ManageMessages', 'ManageThreads'],
  },
  {
    name: 'Support',
    color: 0x3498db, // blue
    hoist: true,
    mentionable: true,
    perms: ['ManageMessages', 'ManageThreads'],
  },
  {
    name: 'Customer',
    color: 0xf1c40f, // gold
    hoist: true,
    mentionable: false,
    perms: [],
  },
  // Game-access roles — granted via the #choose-your-games picker; they unlock
  // each game's category. No special powers, just channel visibility.
  {
    name: 'Prior Extinction',
    color: 0xe67e22, // orange
    hoist: false,
    mentionable: false,
    perms: [],
  },
  {
    name: 'Project Delta',
    color: 0x1abc9c, // teal
    hoist: false,
    mentionable: false,
    perms: [],
  },
  {
    name: 'Free User',
    color: 0x95a5a6, // grey
    hoist: false,
    mentionable: false,
    perms: [],
  },
];

// Roles that count as "staff" — they can see staff channels.
const STAFF_ROLES = ['Moderator', 'Dev', 'Support'];

// Roles that can see & handle TICKETS specifically (a subset of staff).
const TICKET_STAFF_ROLES = ['Moderator', 'Support'];

// "Mods" — the only roles that can see the key system (safes + free-key tickets) for now.
const MOD_ROLES = ['Moderator'];

// Channel where the bot pings on key-use / HWID alerts (mod-only). Kept as part
// of the KEY SAFES vaults — the old free/premium key generator has been removed.
const KEY_ALERTS_CHANNEL = 'key-alerts';

// The web page where users actually get their free key. The Discord "Get Free
// Key" button just hands them this link (Discord can't write the clipboard).
const FREE_KEY_URL = 'https://eazycheats.com/key';

// Reusable suggestion-forum tags (used by each game's suggestions forum).
const SUGGESTION_TAGS = [
  { name: 'Feature',  emoji: { name: '💡' } },
  { name: 'QOL',      emoji: { name: '🔧' } },
  { name: 'Bug',      emoji: { name: '🐛' } },
  { name: 'Approved', emoji: { name: '✅' }, moderated: true },
  { name: 'Declined', emoji: { name: '❌' }, moderated: true },
];

// --- GAMES ---
// Each game gets its own role-gated category with the same set of channels,
// prefixed by `prefix`. `renameFrom` adopts an existing channel (rename in
// place, keeps messages) instead of creating a new one — used to turn the
// current general/suggestions/updates into Prior Extinction's.
const GAMES = [
  {
    key: 'prior',
    name: 'Prior Extinction',
    role: 'Prior Extinction',
    category: '🩸 PRIOR EXTINCTION',
    prefix: 'prior',
    emoji: '🩸',
    keyPrefix: 'Prior-Free-Key-',
    renameFrom: { general: 'general', suggestions: 'suggestions', updates: 'updates', 'to-do-list': 'to-do-list' },
  },
  {
    key: 'pd',
    name: 'Project Delta',
    role: 'Project Delta',
    category: '🔷 PROJECT DELTA',
    prefix: 'pd',
    emoji: '🔷',
    keyPrefix: 'PD-Free-Key-',
    renameFrom: {},
    // Not released yet: no picker button, nobody can get the role. The category +
    // channels stay (structure kept, staff-visible). Flip to false to release.
    hidden: true,
  },
];

// The channels every game gets (name = `<prefix>-<suffix>`).
//   onlyGames  -> restrict this channel to specific game keys (skip the rest)
//   freekeyLink -> post the "Get Free Key" link panel in this channel
const GAME_CHANNELS = [
  { suffix: 'general',     type: 'text' },
  { suffix: 'suggestions', type: 'forum' },
  { suffix: 'updates',     type: 'text', readonly: true },
  { suffix: 'to-do-list',  type: 'text', readonly: true },
  { suffix: 'free-key',    type: 'text', readonly: true, freekeyLink: true, onlyGames: ['prior'] },
  { suffix: 'script',      type: 'text', readonly: true },
];

// Channel where closed-ticket transcripts get logged (in the STAFF category).
const TICKET_LOG_CHANNEL = 'ticket-logs';

// Channel where new-member welcome greetings are posted.
const WELCOME_CHANNEL = 'welcome';

// The role granted when a member clicks "Agree to the Rules".
// Members must have this role to see/talk in the server (the rules gate).
const VERIFIED_ROLE = 'Free User';

// The rules shown in the welcome gate. Edit freely + re-run setup.
const RULES = [
  'Be respectful — no harassment, hate speech, slurs, or discrimination.',
  'No spam, mass pings, or advertising / self-promo without staff permission.',
  'Keep it safe-for-work. No NSFW, gore, or shock content.',
  'No scamming, phishing, or malware. Chargebacks = permanent ban.',
  'Use the correct channels, and open a ticket in #open-a-ticket for support.',
  "Follow Discord's Terms of Service and Community Guidelines at all times.",
  'Staff decisions are final — listen to Moderators, Dev, and Support.',
];

// --- CHANNEL LAYOUT ---
// access: 'public' | 'member' | 'customer' | 'staff' | 'ticketstaff' | 'modonly'
//   public      -> EVERYONE, even before agreeing to rules (the gate channel)
//   member      -> only people who agreed (Free User) + Customer + staff
//   customer    -> only Customer + staff
//   staff       -> only staff roles
//   ticketstaff -> only Support + Moderator
//   modonly     -> only Moderator (the "mods") — used by the key system
// readonly: members can read but not send (staff can still send)
// bottom: true  -> pin this category to the very bottom of the channel list
// type: 'text' | 'voice'
const CATEGORIES = [
  {
    name: '📢 INFORMATION',
    access: 'member',
    channels: [
      // Public greeting channel — the bot posts a welcome here when someone joins.
      { name: 'welcome', access: 'public', readonly: true, welcomeInfo: true, topic: 'New members get greeted here. Head to #verify to unlock the server.' },
      // The gate: agree to the rules, then pick your games (all in one channel).
      { name: 'verify', access: 'public', readonly: true, verifyPanel: true, topic: 'Agree to the rules, then choose the games you want to see.' },
      { name: 'rules',          readonly: true,  topic: 'Server rules. Breaking them = warning, mute, or ban.' },
      { name: 'announcements',  readonly: true,  topic: 'Official EazyCheats announcements.' },
    ],
  },
  {
    name: '🎫 SUPPORT',
    access: 'member',
    channels: [
      { name: 'open-a-ticket',  readonly: true, ticketPanel: true, topic: 'Click the button to open a private support ticket.' },
    ],
  },
  {
    name: '🛠️ STAFF',
    access: 'staff',
    channels: [
      { name: 'staff-chat',     topic: 'Private staff discussion.' },
      { name: 'staff-commands', staffCommands: true, topic: 'Run bot/admin commands here.' },
      { name: 'mod-log',        readonly: true, topic: 'Moderation and bot action log.' },
      // Ticket transcripts — only Support + Moderator can see these.
      { name: 'ticket-logs', access: 'ticketstaff', topic: 'Transcripts of closed tickets. Delete once no longer needed.' },
    ],
  },
  {
    name: '🔊 VOICE',
    access: 'member',
    channels: [
      { name: 'General',   type: 'voice' },
      { name: 'Music',     type: 'voice' },
      { name: 'Support',   type: 'voice' },
      { name: 'Staff',     type: 'voice', access: 'staff' },
    ],
  },
  // --- KEY SYSTEM (mods only, pinned to the bottom) ---
  {
    name: '🔑 KEY SAFES',
    access: 'modonly',
    bottom: true,
    channels: [
      { name: 'free-key-safe',    readonly: true, topic: 'Log of issued free keys, with their live 4-hour timers.' },
      { name: 'premium-key-safe', readonly: true, topic: 'Premium keys live here.' },
      { name: 'key-alerts',       readonly: true, topic: 'The bot pings here when a key is used on a new device (HWID mismatch).' },
    ],
  },
];

// The category where new ticket channels get created (made automatically).
const TICKET_CATEGORY = '🎟️ TICKETS';

module.exports = {
  ROLES, STAFF_ROLES, TICKET_STAFF_ROLES, MOD_ROLES, VERIFIED_ROLE, RULES,
  CATEGORIES, TICKET_CATEGORY, TICKET_LOG_CHANNEL, WELCOME_CHANNEL,
  KEY_ALERTS_CHANNEL, FREE_KEY_URL,
  GAMES, GAME_CHANNELS, SUGGESTION_TAGS,
};
