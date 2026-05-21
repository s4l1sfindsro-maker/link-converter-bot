const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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

client.once("clientReady", () => {
    console.log(`✅ Bot listo como Links converter by S4l1sfinds_ro#3193`);
});

client.on("messageCreate", async (message) => {
    try {

        if (message.author.bot) return;

        const urls = extractUrlsFromText(message.content);

        if (!urls.length) return;

        for (const url of urls) {

            try {

                const result = await convertAnyLinkToBbdbuy(url);

                if (!result) continue;

                const embed = new EmbedBuilder()
                    .setColor("#ff9900")
                    .setDescription("👑 la de aici link, tati");

                const row = new ActionRowBuilder().addComponents(

                    new ButtonBuilder()
                    .setLabel("BBDBuy")
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.bbdbuyUrl)
                    .setEmoji({ name: "bbdbuy", id: "1506622312454033589" }),

                    new ButtonBuilder()
                        .setLabel("Original Link")
                        .setStyle(ButtonStyle.Link)
                        .setURL(result.originalUrl)
                        .setEmoji("🔗"),

                    new ButtonBuilder()
                        .setLabel("QC Finder")
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://finds.ly/product/${result.marketplace}/${result.itemId}`)
                        .setEmoji("🔍")
                );

                await message.reply({
                    embeds: [embed],
                    components: [row],
                    allowedMentions: {
                        repliedUser: false,
                    },
                });

            } catch (err) {
                console.error(`❌ Error converting ${url}:`, err);
            }
        }

    } catch (err) {
        console.error("❌ General Error:", err);
    }
});

client.login(process.env.DISCORD_TOKEN);

setInterval(() => {
    console.log("🟢 Bot sigue vivo...");
}, 60000);
