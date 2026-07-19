// Builders for the #welcome channel: a static intro + the per-join greeting.
const { EmbedBuilder } = require('discord.js');

// Static message pinned-feel intro posted once by setup.
function buildWelcomeInfo(verifyChannel) {
  const verify = verifyChannel ? `<#${verifyChannel.id}>` : '#verify';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👋 Welcome to EazyCheats!')
    .setDescription(
      'Glad to have you here. New members are greeted in this channel.\n\n' +
      `**To unlock the rest of the server, head to ${verify} and click "Agree to the Rules".**\n\n` +
      'See you inside! — EazyCheats'
    )
    .setFooter({ text: 'EazyCheats — We make you better at games' });
  return { embeds: [embed] };
}

// Greeting posted whenever a new member joins.
function buildWelcomeGreeting(member, verifyChannel) {
  const verify = verifyChannel ? `<#${verifyChannel.id}>` : '#verify';
  const count = member.guild.memberCount;
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎉 A new member joined!')
    .setDescription(
      `Welcome <@${member.id}> to **${member.guild.name}**!\n\n` +
      `You're member **#${count}**. To get access to everything, go to ${verify} and agree to the rules.`
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'EazyCheats — We make you better at games' });
  return { content: `<@${member.id}>`, embeds: [embed] };
}

module.exports = { buildWelcomeInfo, buildWelcomeGreeting };
