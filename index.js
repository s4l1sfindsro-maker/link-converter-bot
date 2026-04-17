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

const { convertAnyLinkToAcbuy, extractUrlsFromText } = require("./parser");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🔥 UUFinds builder correcto
function buildUuFindsSearchUrl(preferredUrl, fallbackUrl) {
  const keyword = preferredUrl || fallbackUrl;
  return `https://www.uufinds.com/imageSearchList?keyword=${encodeURIComponent(keyword)}`;
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
        const result = await convertAnyLinkToAcbuy(originalInputUrl);
        if (!result) continue;

        const acbuyUrl = result.acbuyUrl;
        const rawUrl = result.originalUrl || originalInputUrl;
        const qcFinderUrl = buildUuFindsSearchUrl(rawUrl, originalInputUrl);

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription("## Ia de aici link, tati");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("ACBuy")
            .setEmoji({ name: "acbuy", id: "1494611125160116355" })
            .setStyle(ButtonStyle.Link)
            .setURL(acbuyUrl),

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
          allowedMentions: { repliedUser: false },
        });
      } catch (err) {
        console.error(`❌ Error converting ${originalInputUrl}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ General error:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);