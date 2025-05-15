// security.ts
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import sanitizeHtml from 'sanitize-html';

export class SecurityManager {
    private static instance: SecurityManager;
    private readonly limiter: rateLimit.RateLimit;
    private readonly apiKey: string;

    private constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                res.status(429).json({
                    error: 'Too many requests',
                    retryAfter: Math.ceil((req as any).rateLimit.resetTime / 1000)
                });
            }
        });
    }

    static getInstance(apiKey: string): SecurityManager {
        if (!SecurityManager.instance) {
            SecurityManager.instance = new SecurityManager(apiKey);
        }
        return SecurityManager.instance;
    }

    sanitizeInput(data: any): any {
        return Object.keys(data).reduce((sanitized, key) => {
            sanitized[key] = sanitizeHtml(String(data[key]), {
                allowedTags: [],
                allowedAttributes: {}
            });
            return sanitized;
        }, {} as Record<string, string>);
    }

    validateRequest(request: any): boolean {
        return request && 
               typeof request === 'object' && 
               request.apiKey === this.apiKey && 
               Object.values(request).every(val => val != null);
    }
}
typescript
Copy
Edit
// wallet.ts
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { SecurityManager } from './security';

export class SecureWallet {
    private connection: Connection;
    private keypair: Keypair;
    private security: SecurityManager;

    constructor(walletKey: string, apiKey: string) {
        this.security = SecurityManager.getInstance(apiKey);
        const sanitizedKey = this.security.sanitizeInput({ key: walletKey }).key;

        this.keypair = Keypair.fromSecretKey(
            Buffer.from(sanitizedKey.split(',').map(x => parseInt(x)))
        );

        this.connection = new Connection(process.env.SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');
    }

    async getBalance(): Promise<number> {
        const balance = await this.connection.getBalance(this.keypair.publicKey);
        return balance / 1e9;
    }

    async sendTransaction(tx: Transaction): Promise<string> {
        try {
            tx.feePayer = this.keypair.publicKey;
            tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
            tx.sign(this.keypair);
            return await sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
        } catch (err: any) {
            throw new Error(`Failed to send transaction: ${err.message}`);
        }
    }

    getPublicKey(): PublicKey {
        return this.keypair.publicKey;
    }
}
typescript
Copy
Edit
// trading-bot.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import Redis from 'ioredis';
import { SecurityManager } from './security';
import { SecureWallet } from './wallet';

const WHITELISTED_TOKENS = [
    'So11111111111111111111111111111111111111112', // SOL
    'Es9vMFrzaCERJJjPRDq6HPucjM7rFt1FQz2eGDvV2wrf', // USDT
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC
];

interface BotConfig {
    walletPrivateKey: string;
    apiKey: string;
}

interface TradeRequest {
    apiKey: string;
    ipAddress: string;
    tokenMint: string;
    roi: number;
    dex: 'raydium' | 'pumpfun';
}

export class SecureTradingBot {
    private readonly redis: Redis;
    private readonly security: SecurityManager;
    private readonly wallet: SecureWallet;
    private isRunning = false;
    private readonly minProfitPercentage = 5.0; // Minimum 5% profit
    private readonly maxSlippage = 0.02; // 2% maximum slippage
    private readonly maxGasPrice = 1000; // Maximum gas price in SOL per million

    constructor(config: BotConfig) {
        this.redis = new Redis({
            host: process.env.REDIS_HOST,
            password: process.env.REDIS_PASSWORD,
            enableReadyCheck: false
        });

        this.security = SecurityManager.getInstance(config.apiKey);
        this.wallet = new SecureWallet(config.walletPrivateKey, config.apiKey);
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }

    async executeTrade(tradeData: TradeRequest): Promise<string> {
        if (!this.security.validateRequest(tradeData)) {
            throw new Error('Invalid trade request');
        }

        const key = `trade:${tradeData.ipAddress}`;
        const count = await this.redis.incr(key);
        await this.redis.expire(key, 60);

        if (count > 5) throw new Error('Rate limit exceeded');
        if (!WHITELISTED_TOKENS.includes(tradeData.tokenMint)) throw new Error('Unapproved token');
        if (tradeData.roi < this.minProfitPercentage) throw new Error('Trade ROI below threshold');

        const tx = new Transaction();
        const currentPrice = await this.getCurrentPrice(tradeData.tokenMint);
        const estimatedProfit = await this.calculateProfit(tradeData, currentPrice);

        if (estimatedProfit < this.minProfitPercentage) {
            throw new Error(`Trade not profitable enough. Estimated profit: ${estimatedProfit}%`);
        }

        this.verifyTransactionSafety(tx);
        const signature = await this.wallet.sendTransaction(tx);
        await this.redis.set(`tx:${signature}`, 'pending', 'EX', 300);

        return signature;
    }

    private async getCurrentPrice(tokenMint: string): Promise<number> {
        // Implementation depends on DEX being used
        return 0; // Replace with actual implementation
    }

    private async calculateProfit(tradeData: TradeRequest, currentPrice: number): Promise<number> {
        const estimatedBuyPrice = await this.getEstimatedBuyPrice(tradeData);
        const estimatedSellPrice = await this.getEstimatedSellPrice(tradeData);
        
        const totalFees = estimatedBuyPrice * 0.003 * 2; // 0.3% typical DEX fee
        const slippageCost = estimatedBuyPrice * this.maxSlippage;
        
        const estimatedProfit = estimatedSellPrice - estimatedBuyPrice - totalFees - slippageCost;
        return (estimatedProfit / estimatedBuyPrice) * 100;
    }

    private async getEstimatedBuyPrice(tradeData: TradeRequest): Promise<number> {
        // Implementation depends on DEX being used
        return 0; // Replace with actual implementation
    }

    private async getEstimatedSellPrice(tradeData: TradeRequest): Promise<number> {
        // Implementation depends on DEX being used
        return 0; // Replace with actual implementation
    }

    private verifyTransactionSafety(tx: Transaction): void {
        if (!tx || tx.instructions.length === 0) {
            throw new Error('Unsafe transaction');
        }
    }
}
tsx
Copy
Edit
// dashboard.tsx
import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

const endpoint = clusterApiUrl('mainnet-beta');
const wallets = [new PhantomWalletAdapter()];

export default function Dashboard() {
    const [status, setStatus] = useState('stopped');

    const handleBotAction = async (action: 'start' | 'stop' | 'withdraw') => {
        try {
            const res = await fetch(`/api/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer YOUR_API_KEY'
                }
            });
            const data = await res.json();
            setStatus(data.status);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <div className="p-4">
                    <h1 className="text-xl font-bold mb-4">Solana Trading Bot Control Panel</h1>
                    <WalletMultiButton />
                    <div className="mt-4 space-x-2">
                        <button onClick={() => handleBotAction('start')} className="px-4 py-2 bg-green-600 text-white rounded">Start</button>
                        <button onClick={() => handleBotAction('stop')} className="px-4 py-2 bg-yellow-500 text-white rounded">Stop</button>
                        <button onClick={() => handleBotAction('withdraw')} className="px-4 py-2 bg-blue-600 text-white rounded">Withdraw</button>
                    </div>
                    <p className="mt-2">Bot status: {status}</p>
                </div>
            </WalletProvider>
        </ConnectionProvider>
    );
}
