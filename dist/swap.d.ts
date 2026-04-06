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
export declare function loadTokenList(): Promise<void>;
export declare function getTokenInfo(mint: string): {
    name: string;
    symbol: string;
    decimals: number;
} | null;
export declare function getTokenMetadata(mint: string): Promise<{
    name: string;
    symbol: string;
}>;
export declare function buyToken(tokenMint: string): Promise<SwapResult>;
