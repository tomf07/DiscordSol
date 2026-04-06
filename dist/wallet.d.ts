import { Connection, Keypair } from "@solana/web3.js";
export declare function getConnection(): Connection;
export declare function getWallet(): Keypair;
export declare function getSOLBalance(): Promise<number>;
export declare function getWalletAddress(): string;
