import "dotenv/config";
import { config } from "./config.js";
import { createDiscordClient } from "./discord.js";
import { loadTokenList } from "./swap.js";
import { getWalletAddress, getSOLBalance } from "./wallet.js";
import { log } from "./logger.js";
async function main() {
    log("startup", "Discord CA Sniper starting...");
    log("startup", `Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
    log("startup", `Auto-confirm: ${config.autoConfirm}`);
    log("startup", `Buy amount: ${config.swap.buyAmountSol} SOL | Slippage: ${config.swap.slippageBps} bps`);
    // Validate required config
    if (!config.discord.token) {
        log("startup_error", "DISCORD_TOKEN is required");
        process.exit(1);
    }
    // Show wallet info
    try {
        const addr = getWalletAddress();
        log("wallet", `Address: ${addr}`);
        if (!config.dryRun) {
            const balance = await getSOLBalance();
            log("wallet", `Balance: ${balance.toFixed(4)} SOL`);
        }
    }
    catch (err) {
        if (config.dryRun) {
            log("wallet_warn", "No wallet configured (OK for dry run)");
        }
        else {
            log("wallet_error", `Wallet error: ${err.message}`);
            process.exit(1);
        }
    }
    // Load Jupiter token list in background
    await loadTokenList();
    // Start Discord client
    const client = createDiscordClient();
    await client.login(config.discord.token);
    // Graceful shutdown
    const shutdown = () => {
        log("shutdown", "Shutting down...");
        client.destroy();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
main().catch((err) => {
    log("fatal", err.message);
    process.exit(1);
});
