export const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        channelIds: (process.env.DISCORD_CHANNEL_ID || "").split(",").map(s => s.trim()).filter(Boolean),
    },
    wallet: {
        privateKey: process.env.WALLET_PRIVATE_KEY,
    },
    rpc: {
        url: process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com",
    },
    swap: {
        buyAmountSol: parseFloat(process.env.BUY_AMOUNT_SOL || "0.1"),
        slippageBps: parseInt(process.env.SLIPPAGE_BPS || "300", 10),
        maxSpendPerHour: parseFloat(process.env.MAX_SPEND_SOL_PER_HOUR || "1.0"),
        maxPriceImpact: 0.15,
    },
    dryRun: process.env.DRY_RUN === "true",
    autoConfirm: process.env.AUTO_CONFIRM === "true",
    logLevel: process.env.LOG_LEVEL || "info",
    sol: {
        mint: "So11111111111111111111111111111111111111112",
    },
};
