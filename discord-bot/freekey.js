// ===================================================================
//  freekey.js — free key generation, persistence, and message builders.
//  Keys are saved to disk so their 4-hour timers survive bot restarts.
// ===================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  FREE_KEY_PREFIX, FREE_KEY_DIGITS, FREE_KEY_TTL_HOURS,
} = require('./config');

// --- storage ---
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'freekeys.json');
let store = null;

function load() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { store = { keys: [] }; }
  if (!Array.isArray(store.keys)) store.keys = [];
  return store;
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}
function addKey(rec) { load(); store.keys.push(rec); save(); }
function updateKey(key, patch) {
  load();
  const k = store.keys.find((x) => x.key === key);
  if (k) { Object.assign(k, patch); save(); }
}
function getKeys() { load(); return store.keys; }

// --- key generation: EazyCheats-FreeKey-<N random digits> ---
function generateKey() {
  let digits = '';
  for (let i = 0; i < FREE_KEY_DIGITS; i++) digits += crypto.randomInt(0, 10);
  return FREE_KEY_PREFIX + digits;
}

const sec = (ms) => Math.floor(ms / 1000);

// --- message builders ---

// Posted inside the requester's own free-key ticket.
function buildKeyTicketMessage(key, userId, expiresAtMs) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🔑 Your Free Key')
    .setDescription(
      `Hey <@${userId}>, here is your free key:\n\n` +
      '```\n' + key + '\n```\n' +
      `⏳ Valid for **${FREE_KEY_TTL_HOURS} hours** — expires <t:${sec(expiresAtMs)}:R> ` +
      `(<t:${sec(expiresAtMs)}:f>).\n\n` +
      'Copy it now. When you\'re done, a mod can close this ticket.'
    )
    .setFooter({ text: 'EazyCheats — free key' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
  return { content: `<@${userId}>`, embeds: [embed], components: [row] };
}

// The record entry in #free-key-safe (mod-only). status: 'active' | 'expired'.
function buildSafeEntry({ key, userId, ticketChannelId, issuedAtMs, expiresAtMs, status }) {
  const active = status !== 'expired';
  const embed = new EmbedBuilder()
    .setColor(active ? 0x2ecc71 : 0xe74c3c)
    .setTitle(active ? '🔑 Free Key Issued' : '🔑 Free Key (Expired)')
    .addFields(
      { name: 'Key', value: '```\n' + key + '\n```' },
      { name: 'User', value: `<@${userId}>`, inline: true },
      { name: 'Ticket', value: ticketChannelId ? `<#${ticketChannelId}>` : 'unknown', inline: true },
      { name: 'Status', value: active ? '🟢 Active' : '🔴 Expired', inline: true },
      { name: 'Issued', value: `<t:${sec(issuedAtMs)}:f>`, inline: true },
      { name: active ? 'Expires' : 'Expired', value: `<t:${sec(expiresAtMs)}:R>`, inline: true },
    )
    .setFooter({ text: 'EazyCheats — free key safe' });
  return { embeds: [embed] };
}

module.exports = {
  generateKey, addKey, updateKey, getKeys,
  buildKeyTicketMessage, buildSafeEntry,
};
