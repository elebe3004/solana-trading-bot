const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { default: fetch } = require("node-fetch");

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

const connection = new Connection("https://api.mainnet-beta.solana.com");
let isRunning = false;
let profit = 0;

// In-memory store
let ownerWallet = null;

// Dummy trading logic using simulated arbitrage
async function checkArbitrageOpportunities() {
  const raydiumPrice = Math.random() * (1.1 - 0.9) + 0.9;
  const pumpfunPrice = Math.random() * (1.1 - 0.9) + 0.9;
  const roi = ((raydiumPrice - pumpfunPrice) / pumpfunPrice) * 100;

  if (roi >= 5) {
    const mockProfit = Math.random() * 0.01; // up to 0.01 SOL
    profit += mockProfit;
    console.log(`[TRADE] Arbitrage executed: ROI=${roi.toFixed(2)}%, Profit=${mockProfit.toFixed(4)} SOL`);
  }
}

async function autoTradeLoop() {
  if (!isRunning) return;
  await checkArbitrageOpportunities();
  setTimeout(autoTradeLoop, 15000); // Every 15 seconds
}

app.post("/start", (req, res) => {
  ownerWallet = req.body.wallet;
  if (!ownerWallet) return res.status(400).send("Wallet address required");
  if (!isRunning) {
    isRunning = true;
    autoTradeLoop();
    console.log("[STARTED] Trading loop started");
  }
  res.send("Trading started");
});

app.post("/stop", (req, res) => {
  isRunning = false;
  console.log("[STOPPED] Trading loop stopped");
  res.send("Trading stopped");
});

app.post("/withdraw", async (req, res) => {
  if (!ownerWallet) return res.status(400).send("No wallet connected");
  if (profit <= 0) return res.status(400).send("No profit to withdraw");
  // In production, send actual transaction. Here we simulate.
  console.log(`[WITHDRAW] Sent ${profit.toFixed(4)} SOL to ${ownerWallet}`);
  profit = 0;
  res.send("Profit withdrawn to your wallet");
});

app.listen(port, () => {
  console.log(`Solana Arbitrage Bot backend running on port ${port}`);
});

// ----------------------------
// Frontend (App.jsx)
// ----------------------------

import { useEffect, useState } from "react";

export default function App() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    if (window.solana && window.solana.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true }).then(({ publicKey }) => {
        setWallet(publicKey.toString());
      });
    }
  }, []);

  const connectWallet = async () => {
    const resp = await window.solana.connect();
    setWallet(resp.publicKey.toString());
  };

  const sendCommand = async (cmd) => {
    if (!wallet) return alert("Connect wallet first");
    const res = await fetch(`https://your-fly-app-name.fly.dev/${cmd}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet })
    });
    const text = await res.text();
    alert(text);
  };

  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold mb-4">Solana Arbitrage Dashboard</h1>
      {wallet ? (
        <p className="mb-4">Connected: {wallet}</p>
      ) : (
        <button onClick={connectWallet} className="bg-blue-500 text-white px-4 py-2 rounded">
          Connect Phantom Wallet
        </button>
      )}

      <div className="mt-6 space-x-4">
        <button onClick={() => sendCommand("start")} className="bg-green-500 text-white px-4 py-2 rounded">Start</button>
        <button onClick={() => sendCommand("stop")} className="bg-yellow-500 text-white px-4 py-2 rounded">Stop</button>
        <button onClick={() => sendCommand("withdraw")} className="bg-red-500 text-white px-4 py-2 rounded">Withdraw</button>
      </div>
    </div>
  );
}
