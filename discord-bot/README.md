# EazyCheats Discord Bot

Auto-builds your whole Discord server (roles, categories, channels, permissions)
and runs a **ticket system**. Two commands do everything.

## What it creates

**Roles** (top → bottom): Moderator, Dev, Support, Customer, Free User
**Channels** (grouped into categories):
- 📢 INFORMATION — welcome, rules, announcements, updates, faq
- 🎫 SUPPORT — open-a-ticket (with the ticket button), support-info
- 💬 COMMUNITY — general, off-topic, media, memes, giveaways
- ⭐ CUSTOMER — downloads, changelog, product-status, customer-chat *(Customer + staff only)*
- 🛠️ STAFF — staff-chat, staff-commands, mod-log *(staff only)*
- 🔊 VOICE — General, Music, Support, Staff
- 🎟️ TICKETS — where live ticket channels appear

Want different roles/channels? Edit `config.js` and re-run setup. It never
duplicates or deletes — it only adds what's missing.

## One-time setup

1. **Create the bot** — https://discord.com/developers/applications → *New Application*.
   Go to the **Bot** tab → *Reset Token* → **Copy** the token.
2. **Configure** — copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` = the token you copied
   - `GUILD_ID` = your server's ID (enable Developer Mode, right-click server → Copy Server ID)
   - `CLIENT_ID` = the Application ID (General Information tab)
3. **Install** — `npm install`
4. **Invite the bot** — `npm run invite`, open the printed link, pick your server, Authorize.
   Make sure the bot's role is near the **top** of your server's role list.
5. **Build the server** — `npm run setup`

## Keep tickets working

```
npm start
```

This must stay running for the "Open Ticket" button to work. Host it anywhere
that runs Node 18+ (a Render background worker, a VPS, or your PC).

## How tickets work

- A member clicks **Open Ticket** in `#open-a-ticket`.
- The bot creates a private channel only they + staff can see, and pings staff.
- One ticket per member at a time.
- Staff or the member clicks **Close Ticket** → channel is deleted after 5s.
