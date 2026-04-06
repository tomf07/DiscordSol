# Discord CA Sniper Bot — Solana

Monitors a Discord channel for Solana contract addresses and auto-buys tokens via Jupiter.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Bot tab → copy the **Bot Token**
3. Enable **Message Content Intent** under Privileged Gateway Intents
4. Invite the bot to your server with this URL (replace `CLIENT_ID`):
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=274877991936&scope=bot
   ```
   (permissions: Send Messages, Read Messages, Embed Links, Read Message History)

### 3. Get a Helius RPC URL

Sign up at [helius.dev](https://helius.dev) and get a free RPC endpoint.

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 5. Run

```bash
# Development (with hot reload via tsx)
npm run dev

# Production
npm run build
npm start
```

## How it works

1. Bot listens to messages in the configured Discord channel(s)
2. Extracts Solana contract addresses (base58 pubkeys) from messages
3. Validates they are real Solana addresses on the ed25519 curve
4. Deduplicates within a 60-second window
5. If `AUTO_CONFIRM=true`: buys immediately via Jupiter swap
6. If `AUTO_CONFIRM=false`: sends a confirm/skip button prompt (30s timeout)
7. Replies with an embed showing tx details or error

## Safety Features

- **DRY_RUN mode**: logs everything, sends Discord messages, but skips actual transactions
- **Hourly spend cap**: configurable `MAX_SPEND_SOL_PER_HOUR`
- **Price impact check**: skips if impact > 15%
- **Blacklist**: add CAs to `blacklist.json` (array of strings) to auto-skip
- **Dedup**: won't buy the same CA twice within 60 seconds
- **Confirmation buttons**: opt-in manual approval before each buy

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | Discord bot token (required) |
| `DISCORD_CHANNEL_ID` | — | Channel ID(s), comma-separated |
| `WALLET_PRIVATE_KEY` | — | Base58 Solana private key |
| `HELIUS_RPC_URL` | mainnet-beta | Helius or any Solana RPC |
| `BUY_AMOUNT_SOL` | 0.1 | SOL per buy |
| `SLIPPAGE_BPS` | 300 | Slippage (300 = 3%) |
| `MAX_SPEND_SOL_PER_HOUR` | 1.0 | Hourly cap |
| `DRY_RUN` | true | Skip actual transactions |
| `AUTO_CONFIRM` | false | Skip confirmation prompt |
| `LOG_LEVEL` | info | debug/info/warn/error |
