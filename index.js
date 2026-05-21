require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const {
  convertAnyLinkToBbdbuy,
  extractUrlsFromText,
} = require("./parser");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function buildUuFindsSearchUrl(preferredUrl, fallbackUrl) {
  const keyword = preferredUrl || fallbackUrl;

  return `https://www.uufinds.com/imageSearchList?keyword=${encodeURIComponent(
    keyword
  )}`;
}

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content) return;

    const urls = extractUrlsFromText(message.content);

    if (!urls.length) return;

    for (const originalInputUrl of urls) {
      try {
        const result = await convertAnyLinkToBbdbuy(originalInputUrl);

        if (!result) continue;

        const bbdbuyUrl = result.bbdbuyUrl;
        const rawUrl = result.originalUrl || originalInputUrl;

        const qcFinderUrl = buildUuFindsSearchUrl(
          rawUrl,
          originalInputUrl
        );

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription("## 👑 Ia de aici link, tati");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
          .setLabel("BBDBuy")
          .setEmoji("🛒")
          .setStyle(ButtonStyle.Link)
          .setURL(bbdbuyUrl),

          new ButtonBuilder()
            .setLabel("Original Link")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Link)
            .setURL(rawUrl),

          new ButtonBuilder()
            .setLabel("QC Finder")
            .setEmoji("🔍")
            .setStyle(ButtonStyle.Link)
            .setURL(qcFinderUrl)
        );

        await message.reply({
          embeds: [embed],
          components: [row],
          allowedMentions: {
            repliedUser: false,
          },
        });
      } catch (err) {
        console.error(
          `❌ Error converting ${originalInputUrl}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("❌ General error:", err);
  }
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

setInterval(() => {
  console.log("🟢 Bot sigue vivo...");
}, 60000);

client.login(process.env.DISCORD_TOKEN);
