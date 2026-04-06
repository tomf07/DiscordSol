import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ButtonInteraction,
  ComponentType,
} from "discord.js";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import { config } from "./config.js";
import { buyToken, SwapResult } from "./swap.js";
import { log } from "./logger.js";

// CA regex: base58 Solana pubkey (32-44 chars, no 0/O/I/l)
const CA_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// Dedup window
const recentCAs = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000;

// Spend tracking
let spendLog: { timestamp: number; amount: number }[] = [];

// Blacklist
let blacklist = new Set<string>();
function loadBlacklist(): void {
  try {
    if (fs.existsSync("blacklist.json")) {
      const data = JSON.parse(fs.readFileSync("blacklist.json", "utf-8"));
      blacklist = new Set(Array.isArray(data) ? data : []);
      log("blacklist", `Loaded ${blacklist.size} blacklisted tokens`);
    }
  } catch {
    log("blacklist_warn", "Failed to load blacklist.json");
  }
}

function isWithinSpendLimit(amount: number): boolean {
  const now = Date.now();
  // Prune old entries
  spendLog = spendLog.filter(e => now - e.timestamp < 3_600_000);
  const totalSpent = spendLog.reduce((sum, e) => sum + e.amount, 0);
  return totalSpent + amount <= config.swap.maxSpendPerHour;
}

function recordSpend(amount: number): void {
  spendLog.push({ timestamp: Date.now(), amount });
}

function isValidSolanaPubkey(addr: string): boolean {
  try {
    const pk = new PublicKey(addr);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

function extractCAs(text: string): string[] {
  const matches = text.match(CA_REGEX) || [];
  const now = Date.now();

  // Clean old dedup entries
  for (const [key, ts] of recentCAs) {
    if (now - ts > DEDUP_WINDOW_MS) recentCAs.delete(key);
  }

  const results: string[] = [];
  for (const match of matches) {
    if (!isValidSolanaPubkey(match)) continue;
    // Skip SOL mint
    if (match === config.sol.mint) continue;
    // Skip blacklisted
    if (blacklist.has(match)) {
      log("blacklist", `Skipping blacklisted CA: ${match}`);
      continue;
    }
    // Dedup
    if (recentCAs.has(match)) continue;
    recentCAs.set(match, now);
    results.push(match);
  }
  return results;
}

function buildSuccessEmbed(ca: string, result: SwapResult): EmbedBuilder {
  const isDry = result.dryRun;
  return new EmbedBuilder()
    .setColor(isDry ? 0xffaa00 : 0x00ff00)
    .setTitle(`${isDry ? "🟡 DRY RUN" : "🟢"} Bought ${result.tokenName} ($${result.tokenSymbol})`)
    .addFields(
      { name: "CA", value: `\`${ca}\``, inline: false },
      { name: "Spent", value: `${result.inputAmount} SOL`, inline: true },
      { name: "Received", value: `${result.outputAmount} ${result.tokenSymbol}`, inline: true },
    )
    .setTimestamp();

  // Add tx link only if not dry run
}

function buildErrorEmbed(ca: string, error: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("❌ Swap Failed")
    .addFields(
      { name: "CA", value: `\`${ca}\``, inline: false },
      { name: "Error", value: error.slice(0, 1024), inline: false },
    )
    .setTimestamp();
}

async function handleBuy(message: Message, ca: string): Promise<void> {
  // Check spend limit
  if (!config.dryRun && !isWithinSpendLimit(config.swap.buyAmountSol)) {
    const embed = buildErrorEmbed(ca, `Hourly spend limit reached (${config.swap.maxSpendPerHour} SOL/hr)`);
    await message.reply({ embeds: [embed] });
    return;
  }

  log("buy", `Executing buy for ${ca}`);
  const result = await buyToken(ca);

  if (result.success) {
    if (!result.dryRun) recordSpend(config.swap.buyAmountSol);
    const embed = buildSuccessEmbed(ca, result);
    // Add tx link for non-dry runs
    if (result.txSignature) {
      embed.addFields({ name: "Tx", value: `[Solscan](https://solscan.io/tx/${result.txSignature})`, inline: false });
    }
    await message.reply({ embeds: [embed] });
  } else {
    const embed = buildErrorEmbed(ca, result.error || "Unknown error");
    await message.reply({ embeds: [embed] });
  }
}

async function handleWithConfirmation(message: Message, ca: string): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`buy_${ca}`).setLabel("✅ Buy").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`skip_${ca}`).setLabel("❌ Skip").setStyle(ButtonStyle.Danger),
  );

  const reply = await message.reply({
    content: `CA detected: \`${ca}\`\nBuy ${config.swap.buyAmountSol} SOL worth?`,
    components: [row],
  });

  try {
    const interaction = await reply.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30_000,
    });

    if (interaction.customId === `buy_${ca}`) {
      await interaction.update({ content: `Buying \`${ca}\`...`, components: [] });
      await handleBuy(message, ca);
    } else {
      await interaction.update({ content: `Skipped \`${ca}\``, components: [] });
    }
  } catch {
    await reply.edit({ content: `Timed out for \`${ca}\``, components: [] });
  }
}

export function createDiscordClient(): Client {
  loadBlacklist();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    log("discord", `Logged in as ${client.user?.tag}`);
    log("discord", `Monitoring channels: ${config.discord.channelIds.join(", ") || "ALL"}`);
  });

  client.on("messageCreate", async (message: Message) => {
    // Ignore own messages
    if (message.author.id === client.user?.id) return;

    // Channel filter
    if (config.discord.channelIds.length > 0 && !config.discord.channelIds.includes(message.channelId)) return;

    const cas = extractCAs(message.content);
    if (cas.length === 0) return;

    log("ca_detect", `Found ${cas.length} CA(s) in message from ${message.author.tag}: ${cas.join(", ")}`);

    for (const ca of cas) {
      try {
        if (config.autoConfirm) {
          await handleBuy(message, ca);
        } else {
          await handleWithConfirmation(message, ca);
        }
      } catch (err: any) {
        log("handler_error", `Error processing CA ${ca}: ${err.message}`);
      }
    }
  });

  return client;
}
