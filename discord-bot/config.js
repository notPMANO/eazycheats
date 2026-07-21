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

// --- Free key generator settings ---
const FREE_KEY_PREFIX = 'EazyCheats-FreeKey-';
const FREE_KEY_DIGITS = 12;            // number of random digits after the prefix
const FREE_KEY_TTL_HOURS = 4;          // how long a free key stays valid
const FREE_KEY_SAFE_CHANNEL = 'free-key-safe';
const FREE_KEY_TICKET_CATEGORY = '🔑 FREE KEY TICKETS';

// --- Premium key settings (mod-generated, permanent) ---
const PREMIUM_KEY_PREFIX = 'EazyCheats-Premium-';
const PREMIUM_KEY_DEFAULT_LENGTH = 16; // digits, if a mod doesn't specify a length
const PREMIUM_KEY_MIN_LENGTH = 6;
const PREMIUM_KEY_MAX_LENGTH = 40;
const PREMIUM_KEY_SAFE_CHANNEL = 'premium-key-safe';

// Channel where the bot pings on key-use / HWID alerts (mod-only).
const KEY_ALERTS_CHANNEL = 'key-alerts';

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
      // The gate: visible to everyone, holds the rules + Agree button.
      { name: 'verify', access: 'public', readonly: true, verifyPanel: true, topic: 'Read the rules and click Agree to unlock the server.' },
      { name: 'rules',          readonly: true,  topic: 'Server rules. Breaking them = warning, mute, or ban.' },
      { name: 'announcements',  readonly: true,  topic: 'Official EazyCheats announcements.' },
      { name: 'updates',        readonly: true,  topic: 'Product & cheat updates, patch notes, undetected status.' },
      { name: 'faq',            readonly: true,  topic: 'Frequently asked questions before you open a ticket.' },
    ],
  },
  {
    name: '🎫 SUPPORT',
    access: 'member',
    channels: [
      { name: 'open-a-ticket',  readonly: true, ticketPanel: true, topic: 'Click the button to open a private support ticket.' },
      { name: 'support-info',   readonly: true, topic: 'How support works and what info to have ready.' },
    ],
  },
  {
    name: '💬 COMMUNITY',
    access: 'member',
    channels: [
      // Forum channel — members create a post per suggestion and vote with 👍.
      {
        name: 'suggestions',
        type: 'forum',
        topic: 'Suggest features and QOL for the script — one idea per post. Search first to avoid duplicates, tag it, and 👍 the ideas you want to see!',
        forum: {
          defaultReaction: '👍',
          tags: [
            { name: 'Feature',  emoji: { name: '💡' } },
            { name: 'QOL',      emoji: { name: '🔧' } },
            { name: 'Bug',      emoji: { name: '🐛' } },
            { name: 'Approved', emoji: { name: '✅' }, moderated: true },
            { name: 'Declined', emoji: { name: '❌' }, moderated: true },
          ],
        },
      },
    ],
  },
  {
    name: '⭐ CUSTOMER',
    access: 'customer',
    channels: [
      { name: 'downloads',      readonly: true, topic: 'Product downloads — customers only.' },
      { name: 'changelog',      readonly: true, topic: 'Version history for your purchases.' },
      { name: 'product-status', readonly: true, topic: 'Live status: undetected / updating / down.' },
      { name: 'customer-chat',  topic: 'Private chat for paying customers.' },
    ],
  },
  {
    name: '🛠️ STAFF',
    access: 'staff',
    channels: [
      { name: 'staff-chat',     topic: 'Private staff discussion.' },
      { name: 'staff-commands', topic: 'Run bot/admin commands here.' },
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
  FREE_KEY_PREFIX, FREE_KEY_DIGITS, FREE_KEY_TTL_HOURS,
  FREE_KEY_SAFE_CHANNEL, FREE_KEY_TICKET_CATEGORY,
  PREMIUM_KEY_PREFIX, PREMIUM_KEY_DEFAULT_LENGTH,
  PREMIUM_KEY_MIN_LENGTH, PREMIUM_KEY_MAX_LENGTH, PREMIUM_KEY_SAFE_CHANNEL,
  KEY_ALERTS_CHANNEL,
};
