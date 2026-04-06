export declare const config: {
    readonly discord: {
        readonly token: string;
        readonly channelIds: string[];
    };
    readonly wallet: {
        readonly privateKey: string;
    };
    readonly rpc: {
        readonly url: string;
    };
    readonly swap: {
        readonly buyAmountSol: number;
        readonly slippageBps: number;
        readonly maxSpendPerHour: number;
        readonly maxPriceImpact: 0.15;
    };
    readonly dryRun: boolean;
    readonly autoConfirm: boolean;
    readonly logLevel: string;
    readonly sol: {
        readonly mint: "So11111111111111111111111111111111111111112";
    };
};
