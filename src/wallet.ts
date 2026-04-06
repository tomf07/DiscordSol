import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config.js";
import { log } from "./logger.js";

let _connection: Connection | null = null;
let _wallet: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.rpc.url, "confirmed");
  }
  return _connection;
}

export function getWallet(): Keypair {
  if (!_wallet) {
    if (!config.wallet.privateKey) throw new Error("WALLET_PRIVATE_KEY not set");
    _wallet = Keypair.fromSecretKey(bs58.decode(config.wallet.privateKey));
  }
  return _wallet;
}

export async function getSOLBalance(): Promise<number> {
  const connection = getConnection();
  const wallet = getWallet();
  const balance = await connection.getBalance(wallet.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export function getWalletAddress(): string {
  return getWallet().publicKey.toString();
}
