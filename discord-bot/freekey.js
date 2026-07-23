// ===================================================================
//  freekey.js — leftover helpers for the #key-alerts vault.
//  The free/premium key GENERATOR was removed (new key system incoming).
//  What remains only supports keyUsedAlert(): look a key up in the old
//  on-disk store (for enrichment) and build the HWID-alert embed.
// ===================================================================
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// --- storage (read-only now; kept so old records still enrich alerts) ---
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
function findKey(key) { load(); return store.keys.find((x) => x.key === key) || null; }

// Alert embed posted in #key-alerts when a key is used on a new device.
function buildHwidAlert({ key, hwid, allHwids, ticketChannelId, userId }) {
  const list = Array.isArray(allHwids) && allHwids.length
    ? allHwids.map((h) => '`' + h + '`').join('\n').slice(0, 1024)
    : '`' + (hwid || 'unknown') + '`';
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⚠️ Key used on a new device')
    .addFields(
      { name: 'Key', value: '```\n' + key + '\n```' },
      { name: 'Newest HWID', value: '`' + (hwid || 'unknown') + '`' },
      { name: `All HWIDs seen (${Array.isArray(allHwids) ? allHwids.length : 1})`, value: list },
      { name: 'User', value: userId ? `<@${userId}>` : 'unknown', inline: true },
      { name: 'Ticket', value: ticketChannelId ? `<#${ticketChannelId}>` : 'n/a', inline: true },
    )
    .setFooter({ text: 'EazyCheats — key monitor' });
  return { embeds: [embed] };
}

module.exports = { findKey, buildHwidAlert };
