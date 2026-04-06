import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config.js";
let _connection = null;
let _wallet = null;
export function getConnection() {
    if (!_connection) {
        _connection = new Connection(config.rpc.url, "confirmed");
    }
    return _connection;
}
export function getWallet() {
    if (!_wallet) {
        if (!config.wallet.privateKey)
            throw new Error("WALLET_PRIVATE_KEY not set");
        _wallet = Keypair.fromSecretKey(bs58.decode(config.wallet.privateKey));
    }
    return _wallet;
}
export async function getSOLBalance() {
    const connection = getConnection();
    const wallet = getWallet();
    const balance = await connection.getBalance(wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
}
export function getWalletAddress() {
    return getWallet().publicKey.toString();
}
