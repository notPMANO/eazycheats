#!/usr/bin/env node
// ============================================================
// EazyCheats Lua obfuscator (pure Node, no deps).
//
//   node tools/obfuscate.js scripts/hub.lua scripts/hub.obf.lua
//
// What it does (reliability-first — it only transforms what it can do 100%
// safely without a full Luau parser, and byte-preserves everything else):
//   1. Strips every comment.
//   2. Encrypts every string literal  ->  (D("<base64 of XOR>"))  decoded at run.
//   3. Packs the whole result into an XOR+base64 blob run via loadstring.
//   4. Leaves a __EZ_WM__ watermark placeholder the server swaps per buyer.
//
// It is NOT unbreakable (nothing delivered as Lua is) — it stops casual copy
// theft and makes reuse painful. The server key-gate is the real protection.
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');

// ---------- helpers ----------
function randKey(n) { return Array.from(crypto.randomBytes(n)); }
function xorBuf(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}
function encStr(valueBuf, key) { return xorBuf(valueBuf, key).toString('base64'); }
// JS mirror of the Lua decoder, used only for the build-time self-check.
function decStr(b64, key) { return xorBuf(Buffer.from(b64, 'base64'), key); }

// Decode a Lua SHORT string literal body (between the quotes) to its real bytes.
function decodeShort(s) {
  const bytes = [];
  let lit = '';
  const flush = () => { if (lit) { for (const b of Buffer.from(lit, 'utf8')) bytes.push(b); lit = ''; } };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== '\\') { lit += c; i++; continue; }
    flush();
    const e = s[i + 1];
    if (e === undefined) { i++; break; }
    const simple = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '\\': 92, '"': 34, "'": 39 };
    if (e in simple) { bytes.push(simple[e]); i += 2; }
    else if (e === '\n') { bytes.push(10); i += 2; }
    else if (e === '\r') { bytes.push(10); i += 2; if (s[i] === '\n') i++; }
    else if (e === 'x') { bytes.push(parseInt(s.substr(i + 2, 2), 16) & 255); i += 4; }
    else if (e === 'z') { i += 2; while (i < s.length && /\s/.test(s[i])) i++; }
    else if (e === 'u') {
      let j = i + 2;
      if (s[j] === '{') { let k = j + 1, hex = ''; while (k < s.length && s[k] !== '}') { hex += s[k]; k++; } for (const b of Buffer.from(String.fromCodePoint(parseInt(hex, 16)), 'utf8')) bytes.push(b); i = k + 1; }
      else { lit += 'u'; i += 2; }
    }
    else if (e >= '0' && e <= '9') { let j = i + 1, num = ''; while (j < s.length && num.length < 3 && s[j] >= '0' && s[j] <= '9') { num += s[j]; j++; } bytes.push(parseInt(num, 10) & 255); i = j; }
    else { lit += e; i += 2; }
  }
  flush();
  return Buffer.from(bytes);
}

// ---------- scanner: replace comments + strings, copy everything else verbatim ----------
function transform(src, strKey) {
  const out = [];
  const checks = [];
  let i = 0;
  const n = src.length;
  function longLevel(pos) { // returns eq-count if src[pos] opens a long bracket [=*[, else -1
    if (src[pos] !== '[') return -1;
    let j = pos + 1, eq = 0;
    while (src[j] === '=') { eq++; j++; }
    return src[j] === '[' ? eq : -1;
  }
  function readLong(pos, lvl) { // returns {content, next}
    const open = 1 + lvl + 1;
    const close = ']' + '='.repeat(lvl) + ']';
    const start = pos + open;
    const end = src.indexOf(close, start);
    if (end === -1) return { content: src.slice(start), next: n };
    return { content: src.slice(start, end), next: end + close.length };
  }
  function emitString(valueBuf) {
    const enc = encStr(valueBuf, strKey);
    checks.push([valueBuf, enc]);
    out.push('(D("' + enc + '"))');
  }
  while (i < n) {
    const c = src[i];
    // comments
    if (c === '-' && src[i + 1] === '-') {
      const lvl = longLevel(i + 2);
      if (lvl >= 0) { out.push(' '); i = readLong(i + 2, lvl).next; continue; }
      let j = i + 2; while (j < n && src[j] !== '\n') j++;
      out.push(' '); i = j; continue;
    }
    // long string
    if (c === '[') {
      const lvl = longLevel(i);
      if (lvl >= 0) {
        const r = readLong(i, lvl);
        let content = r.content;
        if (content[0] === '\n') content = content.slice(1);
        else if (content[0] === '\r' && content[1] === '\n') content = content.slice(2);
        emitString(Buffer.from(content, 'utf8'));
        i = r.next; continue;
      }
    }
    // short string
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (src[j] === '\n') { j++; break; } // unterminated safety
        j++;
      }
      emitString(decodeShort(src.slice(i + 1, j - 1)));
      i = j; continue;
    }
    out.push(c); i++;
  }
  return { code: out.join(''), checks };
}

// ---------- Lua runtime prelude (pure Lua: works in Luau + any 5.x, no bit32) ----------
function luaTable(arr) { return '{' + arr.join(',') + '}'; }
const PRELUDE = [
  'local function _bx(a,b) local r,p=0,1 while a>0 or b>0 do local x,y=a%2,b%2 if x~=y then r=r+p end p=p*2 a=(a-x)/2 b=(b-y)/2 end return r end',
  'local _A="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"',
  'local _M={} for i=1,64 do _M[_A:sub(i,i)]=i-1 end',
  'local function _b64(d) local o={} local buf,bl=0,0 for i=1,#d do local v=_M[d:sub(i,i)] if v then buf=buf*64+v bl=bl+6 if bl>=8 then bl=bl-8 o[#o+1]=string.char(math.floor(buf/(2^bl))%256) buf=buf%(2^bl) end end end return table.concat(o) end',
  'local function _dx(s,k) local t=_b64(s) local o={} local n=#k for i=1,#t do o[i]=string.char(_bx(t:byte(i),k[(i-1)%n+1])) end return table.concat(o) end',
].join('\n');

// ---------- main ----------
const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: node tools/obfuscate.js <in.lua> <out.lua>'); process.exit(1); }

let src = fs.readFileSync(inPath, 'utf8');
if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1); // strip BOM

const K1 = randKey(32); // inner string key
const K2 = randKey(48); // outer pack key

// 1) strip comments + encrypt strings
const { code, checks } = transform(src, K1);

// build-time self-check: every encrypted string must decode back to its exact bytes
for (const [orig, enc] of checks) {
  if (!decStr(enc, K1).equals(orig)) {
    console.error('SELF-CHECK FAILED for a string literal — aborting.'); process.exit(2);
  }
}

// 2) inner chunk = prelude + D() + transformed code
const inner = PRELUDE + '\nlocal function D(s) return _dx(s,' + luaTable(K1) + ') end\n' + code;

// 3) pack the inner chunk into an XOR+base64 blob
const blob = xorBuf(Buffer.from(inner, 'utf8'), K2).toString('base64');

const outer =
  '--EZ:__EZ_WM__\n' +
  PRELUDE + '\n' +
  'local _s=_dx("' + blob + '",' + luaTable(K2) + ')\n' +
  'local _f=(loadstring or load)(_s)\n' +
  'if _f then return _f() end\n';

fs.writeFileSync(outPath, outer);
console.log('obfuscated ' + inPath + ' -> ' + outPath);
console.log('  strings encrypted: ' + checks.length);
console.log('  in:  ' + src.length + ' bytes');
console.log('  out: ' + outer.length + ' bytes (' + (outer.length / src.length).toFixed(2) + 'x)');
