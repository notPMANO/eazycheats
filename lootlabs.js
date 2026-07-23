// LootLabs integration — turns a free-key request into a monetized (ad-gated)
// link and lets the server verify completion.
//
// Flow:
//   1. We pre-created ONE content_locker link in the LootLabs panel; its short
//      URL is LOOT_URL. Hitting it raw just lands on /key (the fallback).
//   2. Per key request we call the url_encryptor (Anti-Bypass) endpoint to
//      AES-encrypt our one-time callback URL into a `data` blob tied to our API
//      key. Appending it as `&data=` makes the locker redirect to OUR callback
//      only after the user finishes the ad tasks. Bypassers can't see or forge
//      the destination because it's encrypted with our key.
//
// The API token is a SECRET — it lives only in the LOOTLABS_API_TOKEN env var
// (never hardcode it; this repo is public). If it's unset the whole feature is
// treated as "not configured" and callers fall back gracefully.

const API_TOKEN = process.env.LOOTLABS_API_TOKEN || '';
// The base monetized link created in the panel (public, not a secret). Override
// via env if you regenerate it.
const LOOT_URL = process.env.LOOTLABS_LOOT_URL || 'https://lootdest.org/s?1hA443nY';

const ENCRYPT_ENDPOINT = 'https://creators.lootlabs.gg/api/public/url_encryptor';

function isConfigured() {
  return Boolean(API_TOKEN);
}

// Encrypt a destination URL into the `data` parameter. Returns the ready-to-use
// (already URL-encoded) string, or null on any failure. Never throws.
async function encryptDestination(destinationUrl) {
  if (!API_TOKEN) return null;
  try {
    const res = await fetch(ENCRYPT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_url: destinationUrl }),
      // Don't hang a page load if LootLabs is slow.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Success shape: { type: 'created'|'fetched', message: '<encrypted>' }
    if (json && json.type && json.type !== 'error' && typeof json.message === 'string') {
      return json.message;
    }
    return null;
  } catch {
    return null;
  }
}

// Build the full monetized URL a user should be sent to: the base locker link
// plus the encrypted &data pointing at our callback. Returns null if we can't
// encrypt (caller decides how to degrade).
async function buildLockerUrl(callbackUrl) {
  const data = await encryptDestination(callbackUrl);
  if (!data) return null;
  // The base LOOT_URL already carries its own `?<short>` query, so join with &.
  // `data` is already percent-encoded by the API — do NOT re-encode it.
  const sep = LOOT_URL.includes('?') ? '&' : '?';
  return `${LOOT_URL}${sep}data=${data}`;
}

module.exports = { isConfigured, encryptDestination, buildLockerUrl, LOOT_URL };
