import { PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "./config.js";
import { getConnection, getWallet } from "./wallet.js";
import { log } from "./logger.js";

const SOL_MINT = config.sol.mint;
const JUPITER_QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_URL = "https://api.jup.ag/swap/v1/swap";

export interface SwapResult {
  success: boolean;
  dryRun?: boolean;
  txSignature?: string;
  inputAmount?: string;
  outputAmount?: string;
  tokenSymbol?: string;
  tokenName?: string;
  priceImpact?: number;
  error?: string;
}

// In-memory token list cache
let tokenListCache: Map<string, { name: string; symbol: string; decimals: number }> | null = null;

export async function loadTokenList(): Promise<void> {
  try {
    log("token_list", "Loading Jupiter token list...");
    const res = await fetch("https://token.jup.ag/all");
    if (!res.ok) throw new Error(`Token list fetch failed: ${res.status}`);
    const tokens: Array<{ address: string; name: string; symbol: string; decimals: number }> = await res.json();
    tokenListCache = new Map();
    for (const t of tokens) {
      tokenListCache.set(t.address, { name: t.name, symbol: t.symbol, decimals: t.decimals });
    }
    log("token_list", `Loaded ${tokenListCache.size} tokens`);
  } catch (err: any) {
    log("token_list_warn", `Failed to load token list: ${err.message}. Will use fallback.`);
    tokenListCache = new Map();
  }
}

export function getTokenInfo(mint: string): { name: string; symbol: string; decimals: number } | null {
  return tokenListCache?.get(mint) ?? null;
}

async function fetchTokenMetadataHelius(mint: string): Promise<{ name: string; symbol: string } | null> {
  try {
    const res = await fetch(config.rpc.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: mint },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.result?.content?.metadata;
    if (content?.name || content?.symbol) {
      return { name: content.name || "Unknown", symbol: content.symbol || mint.slice(0, 6) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getTokenMetadata(mint: string): Promise<{ name: string; symbol: string }> {
  // Try Jupiter cache first
  const cached = getTokenInfo(mint);
  if (cached) return { name: cached.name, symbol: cached.symbol };

  // Fallback to Helius DAS
  const helius = await fetchTokenMetadataHelius(mint);
  if (helius) return helius;

  return { name: "Unknown", symbol: mint.slice(0, 6) };
}

export async function buyToken(tokenMint: string): Promise<SwapResult> {
  const amountLamports = Math.floor(config.swap.buyAmountSol * LAMPORTS_PER_SOL);

  // Dry run
  if (config.dryRun) {
    const meta = await getTokenMetadata(tokenMint);
    log("swap_dry", `Would buy ${meta.symbol} (${tokenMint}) with ${config.swap.buyAmountSol} SOL`);
    return {
      success: true,
      dryRun: true,
      tokenSymbol: meta.symbol,
      tokenName: meta.name,
      inputAmount: config.swap.buyAmountSol.toString(),
      outputAmount: "N/A (dry run)",
    };
  }

  try {
    // 1. Get quote
    log("swap", `Getting quote: ${config.swap.buyAmountSol} SOL → ${tokenMint}`);
    const quoteUrl = `${JUPITER_QUOTE_URL}?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${amountLamports}&slippageBps=${config.swap.slippageBps}`;
    const quoteRes = await fetch(quoteUrl);

    if (!quoteRes.ok) {
      const body = await quoteRes.text();
      throw new Error(`Quote failed: ${quoteRes.status} ${body}`);
    }

    const quote = await quoteRes.json();
    if (quote.error) throw new Error(`Quote error: ${quote.error}`);

    // Check price impact
    const priceImpact = parseFloat(quote.priceImpactPct || "0");
    if (priceImpact > config.swap.maxPriceImpact) {
      return {
        success: false,
        priceImpact,
        error: `Price impact too high: ${(priceImpact * 100).toFixed(1)}% (max ${config.swap.maxPriceImpact * 100}%)`,
      };
    }

    // Check output is non-zero
    if (!quote.outAmount || quote.outAmount === "0") {
      return { success: false, error: "No route found — output is 0" };
    }

    // 2. Get swap transaction
    log("swap", "Building swap transaction...");
    const wallet = getWallet();
    const swapRes = await fetch(JUPITER_SWAP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapRes.ok) {
      throw new Error(`Swap tx build failed: ${swapRes.status} ${await swapRes.text()}`);
    }

    const { swapTransaction } = await swapRes.json();

    // 3. Deserialize, sign, send
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    tx.sign([wallet]);

    const connection = getConnection();
    const txSignature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });

    log("swap", `Tx sent: ${txSignature}, confirming...`);
    await connection.confirmTransaction(txSignature, "confirmed");
    log("swap", `Confirmed: ${txSignature}`);

    // Get token metadata
    const meta = await getTokenMetadata(tokenMint);

    // Format output amount
    const tokenInfo = getTokenInfo(tokenMint);
    const decimals = tokenInfo?.decimals ?? 9;
    const outputAmount = (parseInt(quote.outAmount) / Math.pow(10, decimals)).toFixed(4);

    return {
      success: true,
      txSignature,
      inputAmount: config.swap.buyAmountSol.toString(),
      outputAmount,
      tokenSymbol: meta.symbol,
      tokenName: meta.name,
      priceImpact,
    };
  } catch (err: any) {
    log("swap_error", err.message);
    return { success: false, error: err.message };
  }
}
