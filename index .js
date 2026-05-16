// ═══════════════════════════════════════════════════════════════════
//  index.js  —  Bot Discord + enregistrement des commandes slash
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();

const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

const { startServer, getIO } = require('./server');

// ── État partagé de la roue ─────────────────────────────────────────
const state = {
  segments    : ['🍋 rayan','💎 pierre','🔥 terrence','💀 arthur','⭐ ajay','⭐ vijay','🃏 noe','🪙 ezeckiel'],
  spinning    : false,
  lastResult  : null,
  spinCount   : 0,
  currentAngle: 0,
};

// ── Définition des commandes ────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder()
    .setName('spin')
    .setDescription('🎰 Lance la roue de casino en direct !'),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('➕ Ajoute un segment à la roue')
    .addStringOption(o => o
      .setName('segment')
      .setDescription('Texte du segment (ex: 🎯 Gros lot)')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('➖ Supprime un segment')
    .addIntegerOption(o => o
      .setName('numero')
      .setDescription('Numéro affiché dans /list')
      .setRequired(true)
      .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('📋 Affiche tous les segments actuels'),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('♻️ Remet la roue par défaut'),

  new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('🔗 Lien vers la roue en direct'),

].map(c => c.toJSON());

// ── Client Discord ──────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ✅ Export du client pour que server.js puisse l'utiliser
module.exports = { client };

// ── Fonction utilitaire : envoie le résultat dans le salon Discord ──
// source : 'discord' | 'web'
async function sendResultToDiscord(result, user, spinCount, source) {
  try {
    const channelId = process.env.DISCORD_CHANNEL_ID;
    if (!channelId) {
      console.warn('⚠️ DISCORD_CHANNEL_ID manquant dans .env');
      return;
    }
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.warn('⚠️ Salon Discord introuvable — vérifiez DISCORD_CHANNEL_ID');
      return;
    }

    if (source === 'web') {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🌐 Roue lancée depuis le site web !')
            .setDescription(`🎯 Résultat :\n\n||**${result}**||\n\n*Clique pour révéler !*`)
            .setColor(0x00FF7F)
            .setFooter({ text: `Spin #${spinCount}` })
            .setTimestamp()
        ]
      });
    } else {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎯 Résultat !')
            .setDescription(`**${user}** a obtenu :\n\n||**${result}**||\n\n*Clique pour révéler !*`)
            .setColor(0x00FF7F)
            .setFooter({ text: `Spin #${spinCount}` })
            .setTimestamp()
        ]
      });
    }
  } catch (err) {
    console.error('❌ Erreur envoi Discord :', err.message);
  }
}

// ✅ Expose la fonction pour que server.js puisse l'appeler
module.exports.sendResultToDiscord = sendResultToDiscord;

// ── Logique de spin partagée ────────────────────────────────────────
// Calcule l'angle final, met à jour state, émet les événements Socket.io
// Retourne { winIndex, result }
function executeSpin(io) {
  const winIndex = Math.floor(Math.random() * state.segments.length);
  const result   = state.segments[winIndex];
  const n        = state.segments.length;

  const arcSize        = (Math.PI * 2) / n;
  const targetSegCenter = winIndex * arcSize + arcSize / 2;
  const angleToTarget   = Math.PI * 2 - targetSegCenter;
  const extraTurns      = (5 + Math.floor(Math.random() * 4)) * Math.PI * 2;

  state.currentAngle += extraTurns + angleToTarget;
  state.spinCount++;

  io.emit('spin-start', {
    segments  : state.segments,
    finalAngle: state.currentAngle,
    winIndex  : winIndex,
  });

  return { winIndex, result };
}

// ── Client prêt ─────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅  Bot connecté : ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: COMMANDS }
    );
    console.log('✅  Commandes slash enregistrées');
  } catch (e) {
    console.error('❌  Erreur commandes :', e.message);
  }

  startServer(state);
});

// ── Gestion des interactions ────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd  = interaction.commandName;
  const user = interaction.user.displayName ?? interaction.user.username;
  const io   = getIO();

  // /spin
  if (cmd === 'spin') {
    if (state.spinning)
      return interaction.reply({ content: '⏳ La roue tourne déjà !', ephemeral: true });
    if (state.segments.length < 2)
      return interaction.reply({ content: '❌ Il faut au moins 2 segments.', ephemeral: true });

    state.spinning = true;

    const { result } = executeSpin(io);

    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎰 La roue tourne !')
        .setDescription(`**${user}** a lancé la roue !\n\n🔴 **[Regarder en direct](${process.env.PUBLIC_URL || '#'})**`)
        .setColor(0xFFD700)
        .setFooter({ text: `Spin #${state.spinCount}` })
        .setTimestamp()
    ]});

    // Synchronisé avec la durée d'animation web (6 200 ms)
    setTimeout(async () => {
      state.spinning   = false;
      state.lastResult = result;
      io.emit('spin-result', { result });

      await sendResultToDiscord(result, user, state.spinCount, 'discord');

      await interaction.followUp({ embeds: [
        new EmbedBuilder()
          .setTitle('🎯 Résultat !')
          .setDescription(`**${user}** a obtenu :\n\n||**${result}**||\n\n*Clique pour révéler !*`)
          .setColor(0x00FF7F)
          .setTimestamp()
      ]});
    }, 6200);
  }

  // /add
  if (cmd === 'add') {
    const seg = interaction.options.getString('segment');
    if (state.segments.length >= 16)
      return interaction.reply({ content: '❌ Maximum 16 segments !', ephemeral: true });
    state.segments.push(seg);
    io.emit('wheel-update', { segments: state.segments });
    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('✅ Segment ajouté')
        .setDescription(`**${seg}** ajouté.\nTotal : **${state.segments.length}** segments`)
        .setColor(0x57F287)
    ]});
  }

  // /remove
  if (cmd === 'remove') {
    const idx = interaction.options.getInteger('numero') - 1;
    if (idx < 0 || idx >= state.segments.length)
      return interaction.reply({ content: `❌ Numéro invalide (1–${state.segments.length})`, ephemeral: true });
    const [removed] = state.segments.splice(idx, 1);
    io.emit('wheel-update', { segments: state.segments });
    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🗑️ Segment supprimé')
        .setDescription(`**${removed}** retiré.`)
        .setColor(0xED4245)
    ]});
  }

  // /list
  if (cmd === 'list') {
    const list = state.segments.map((s, i) => `\`${i+1}.\` ${s}`).join('\n');
    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎡 Segments de la roue')
        .setDescription(list || 'Aucun segment')
        .setColor(0x5865F2)
        .setFooter({ text: `${state.segments.length} segments` })
    ]});
  }

  // /clear
  if (cmd === 'clear') {
    state.segments = ['🍋 Citron','💎 Diamant','🔥 Jackpot','💀 Zéro','⭐ Bonus','🎁 Cadeau','🃏 Joker','🪙 Or'];
    io.emit('wheel-update', { segments: state.segments });
    await interaction.reply('♻️ Roue réinitialisée !');
  }

  // /wheel
  if (cmd === 'wheel') {
    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎰 Roue Casino — En direct')
        .setDescription(`🔴 **[Ouvrir la roue](${process.env.PUBLIC_URL || '#'})**`)
        .setColor(0xFFD700)
    ]});
  }
});

client.login(process.env.DISCORD_TOKEN);
