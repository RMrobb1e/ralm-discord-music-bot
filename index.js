const {
  Client,
  GuildMember,
  GatewayIntentBits,
  ApplicationCommandOptionType,
} = require("discord.js");
const {
  Player,
  QueryType,
  useQueue,
  useMainPlayer,
} = require("discord-player");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on("ready", () => {
  console.log("Bot is online!");
  client.user.setActivity({
    name: "🎶 | Music Time",
    type: "LISTENING",
  });
});
client.on("error", console.error);
client.on("warn", console.warn);

const player = new Player(client, {
  useLegacyFFmpeg: false,
  ytdlOptions: {
    quality: "highestaudio",
    highWaterMark: 1 << 25,
  },
});

player.extractors
  .loadDefault()
  .then((r) => console.log("Extractors loaded successfully"));

player.on("error", (queue, error) => {
  console.log(
    `[${queue.guild.name}] Error emitted from the queue: ${error.message}`,
  );
});
player.on("connectionError", (queue, error) => {
  console.log(
    `[${queue.guild.name}] Error emitted from the connection: ${error.message}`,
  );
});

player.on("trackStart", (queue, track) => {
  queue.metadata.send(
    `🎶 | Now playing by DJ Robbie BOT: **${track.title}** in **${queue.connection.channel.name}**!`,
  );
});

player.on("trackAdd", (queue, track) => {
  queue.metadata.send(`🎶 | Track **${track.title}** queued!`);
});

player.on("botDisconnect", (queue) => {
  queue.metadata.send(
    "❌ | I was manually disconnected from the voice channel, clearing queue!",
  );
});

player.on("channelEmpty", (queue) => {
  queue.metadata.send("❌ | Nobody is in the voice channel, leaving...");
});

player.on("queueEnd", (queue) => {
  queue.metadata.send("✅ | Queue finished!");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!client.application?.owner) await client.application?.fetch();

  if (
    message.content === "!deploy" &&
    message.author.id === client.application?.owner?.id
  ) {
    await message.guild.commands.set([
      {
        name: "play",
        description: "Plays a song from youtube",
        options: [
          {
            name: "query",
            type: ApplicationCommandOptionType.String,
            description: "The song you want to play",
            required: true,
          },
        ],
        autocomplete: async (interaction) => {
          const query = interaction.options.getString("query");
          if (!query) return [];
          const result = await player.search(query);

          const returnData = [];
          if (result.playlist) {
            returnData.push({
              name: "Playlist | " + result.playlist.title,
              value: query,
            });
          }

          result.tracks.slice(0, 24).forEach((track) => {
            let name = `${track.title} | ${track.author ?? "Unknown"} (${
              track.duration ?? "n/a"
            })`;
            if (name.length > 100) name = `${name.slice(0, 97)}...`;

            let url = track.url;
            if (url.length > 100) url = url.slice(0, 100);
            return returnData.push({
              name,
              value: url,
            });
          });

          await interaction.respond(returnData);
        },
      },
      {
        name: "skip",
        description: "Skip to the current song",
      },
      {
        name: "stop",
        description: "Stop the player",
      },
    ]);

    await message.reply("Deployed!");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand() || !interaction.guildId) return;

  if (
    !(interaction.member instanceof GuildMember) ||
    !interaction.member.voice.channel
  ) {
    return void interaction.reply({
      content: "You are not in a voice channel!",
      ephemeral: true,
    });
  }

  if (interaction.commandName === "play") {
    await interaction.deferReply();
    const query = interaction.options.getString("query");
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });

    if (!searchResult?.tracks.length)
      return void interaction.followUp({
        content: "Di ko makita sa youtube, ayusen mo title mo bisakol!",
      });

    // create a queue
    // await player.play(
    //   interaction.member.voice.channel.id,
    //   searchResult.tracks[0],
    //   {
    //     nodeOptions: { metadata: interaction.channel },
    //   },
    // );
    // // const queue = await player.createQueue(interaction.guild, {
    // //   metadata: interaction.channel,
    // // });

    try {
      // await queue.connect(interaction.member.voice.channel);
      // queue.play(searchResult.tracks[0], { metadata: interaction.channel });
      const res = await player.play(
        interaction.member.voice.channel.id,
        searchResult,
        {
          nodeOptions: {
            metadata: {
              channel: interaction.channel,
              client: interaction.guild.members.me,
              requestedBy: interaction.user,
            },
            bufferingTimeout: 15000,
            leaveOnStop: true,
            leaveOnStopCooldown: 5000,
            leaveOnEnd: true,
            leaveOnEndCooldown: 15000,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 300000,
            skipOnNoStream: true,
          },
        },
      );

      // await interaction.followUp({
      //   content: `⏱ | Loading your ${
      //     searchResult.playlist ? "playlist" : "track"
      //   }...`,
      // });
      // searchResult.playlist
      //   ? queue.addTracks(searchResult.tracks)
      //   : queue.addTrack(searchResult.tracks[0]);
      // if (!queue.playing) await queue.play();
      const message = res.track.playlist
        ? `Successfully enqueued **track(s)** from: **${res.track.playlist.title}**`
        : `Successfully enqueued: **${res.track.author} - ${res.track.title}**`;

      return interaction.followUp({
        content: message,
      });
    } catch (e) {
      console.log(e);
      await interaction.editReply({
        content: "An error has occurred!",
      });
      return void interaction.followUp({
        content: "Could not join your voice channel!",
      });
    }
    // FIXME: not working currently
  } else if (interaction.commandName === "skip") {
    await interaction.deferReply();
    const queue = player.queues;
    // const queue = player.getQueue(interaction.guildId);
    if (!queue?.cache)
      return void interaction.followUp({
        content: "❌ | No music is being played!",
      });
    console.log(player.nodes);
    console.log(queue);
    const currentTrack = player.nodes.get(interaction.guildId)?.queue?.current;
    const success = queue.skip();
    return void interaction.followUp({
      content: success
        ? `✅ | Skipped **${currentTrack}**!`
        : "❌ | Something went wrong!",
    });
    // FIXME: not working currently
  } else if (interaction.commandName === "stop") {
    await interaction.deferReply();
    const queue = player.queues;
    if (!queue?.cache)
      return void interaction.followUp({
        content: "❌ | No music is being played!",
      });
    player.off();
    return void interaction.followUp({ content: "🛑 | Stopped the player!" });
  } else {
    interaction.reply({
      content: "Unknown command!",
      ephemeral: true,
    });
  }
});

client.login(config.token);
