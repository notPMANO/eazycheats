// Prints the invite link that adds the bot to your server with the right
// permissions. Run with: npm run invite
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID) {
  console.error('\n❌ CLIENT_ID missing from .env (Developer Portal -> General Information -> Application ID).\n');
  process.exit(1);
}

// permissions=8 is Administrator. scope bot+applications.commands.
const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

console.log('\n🔗 Invite your bot with this link (open it, pick your server, click Authorize):\n');
console.log('   ' + url + '\n');
