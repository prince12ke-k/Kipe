const axios = require("axios");

const API_URL = "https://fahim-api-demo.onrender.com/ai/aiease/v1";
const API_COOKIE =
  "connect.sid=s%3A7sKKv8NJgIs6k3gb4DVeDiPAQNr1cyUE.m%2BNmkn%2BHDCqttRUhpW5sm9vjshuCccz3nNSoC3FBQK8";

const ALLOWED_RATIOS = [
  "1:1", "5:4", "4:5", "4:3", "3:4",
  "3:2", "2:3", "16:9", "9:16", "21:9"
];

const MODEL_MAP = {
  "sd_4.0": "doubao-seedream-4.0",
  "sd_4.5": "doubao-seedream-4.5",
  "nano_banana": "kie_nano_banana"
};

const ALLOWED_QUALITY = ["2k", "4k"];

function parseFlags(input) {
  const tokens = input.split(/\s+/);
  const promptParts = [];
  let ratio, model, quality;

  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i]) {
      case "--ar":
      case "--ratio":
        ratio = tokens[++i];
        break;
      case "--model":
        model = tokens[++i];
        break;
      case "--quality":
        quality = tokens[++i];
        break;
      default:
        promptParts.push(tokens[i]);
    }
  }

  return {
    prompt: promptParts.join(" "),
    ratio,
    model,
    quality
  };
}

module.exports = {
  config: {
    name: "sd",
    aliases: ["seedream"],
    version: "1.8",
    role: 0,
    author: "S M Fahim",
    countDown: 5,
    category: "image",
    guide: {
      en:
        "{pn} a cute cat --model sd_4.5 --quality 4k\n" +
        "Reply images + {pn} combine them --model nano_banana --ar 3:2"
    }
  },

  onStart: async function ({ message, event, args }) {
    const input = args.join(" ").trim();

    if (!input) {
      return message.reply("❌ | Prompt is required.");
    }

    const parsed = parseFlags(input);

    if (!parsed.prompt) {
      return message.reply("❌ | Prompt cannot be empty.");
    }

    const prompt = parsed.prompt;
    const modelKey = parsed.model || "sd_4.0";
    const realModel = MODEL_MAP[modelKey] || MODEL_MAP["sd_4.0"];

    const ratio =
      parsed.ratio && ALLOWED_RATIOS.includes(parsed.ratio)
        ? parsed.ratio
        : null;

    let qualityParam = "";
    let qualityText = "";

    if (realModel !== "kie_nano_banana") {
      const quality = ALLOWED_QUALITY.includes(parsed.quality)
        ? parsed.quality
        : "2k";
      qualityParam = `&quality=${quality}`;
      qualityText = `📐 Quality: ${quality}\n`;
    }

    let imageUrls = [];

    if (event.messageReply?.attachments?.length) {
      imageUrls = event.messageReply.attachments
        .filter(att => att?.url)
        .slice(0, 10)
        .map(att => att.url);
    }

    let apiUrl =
      `${API_URL}` +
      `?prompt=${encodeURIComponent(prompt)}` +
      `&model=${realModel}`;

    if (ratio) {
      apiUrl += `&ratio=${ratio}`;
    }

    apiUrl += qualityParam;

    if (imageUrls.length > 0) {
      apiUrl += `&url=${encodeURIComponent(imageUrls.join(","))}`;
    }

    message.reply("🎨 | Processing image...", async (err, info) => {
      try {
        const res = await axios.get(apiUrl, {
          headers: {
            Cookie: API_COOKIE,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
          }
        });

        if (!res.data?.success || !Array.isArray(res.data.images)) {
          return message.reply("❌ | Image generation failed.");
        }

        const image = res.data.images[0];

        const attachment = await global.utils.getStreamFromURL(
          image,
          "seedream.png"
        );

        message.reply({
          body:
            `✅ | ${realModel} Result\n\n` +
            `🧠 Prompt: ${prompt}\n\n` +
            `⚙ Model: ${realModel}\n` +
            `🖼 Ratio: ${ratio || "Auto (API)"}\n` +
            qualityText +
            (imageUrls.length
              ? `🧩 Images used: ${imageUrls.length}\n`
              : ""),
          attachment
        });

        message.unsend(info.messageID);

      } catch (error) {
        console.error(error);
        message.reply("❌ | API error while generating image.");
      }
    });
  }
};
