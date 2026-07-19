// Builder for the welcome/rules gate panel (posted in #welcome).
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

function buildVerifyPanel(rules) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('👋 Welcome to EazyCheats — Please Read the Rules')
    .setDescription(
      'The rest of the server is locked until you agree to the rules.\n' +
      'Read them below, then click **✅ Agree to the Rules** to unlock every channel.\n\n' +
      rules.map((r, i) => `**${i + 1}.** ${r}`).join('\n') +
      '\n\n_Clicking Agree gives you the **Free User** role and full access._'
    )
    .setFooter({ text: 'EazyCheats — We make you better at games' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_agree')
      .setLabel('Agree to the Rules')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildVerifyPanel };
