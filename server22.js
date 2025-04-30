import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, createWalletClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {   
  getUniswapV3Quote,
  swapWithUniswapV3, 
  tokensList 
} from "./src/swapUniswapV3.js";

import dotenv from "dotenv";
import { accountTokens } from "./src/checkbalance.js";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const server = new McpServer({
  name: "monad-testnet",
  version: "1.1.0"
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

server.tool(
  "get-token-balance",
  "Get Token Balance of an account",
  {
    account: z.string().describe("Account Address"),
  },
  async ({ account }) => {
    try {
      const tokenBalances = await accountTokens(account);

      return {
        content: [
          {
            type: "text",
            text: `Token Balances for ${account}:\n${tokenBalances}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve token balance for address: ${account}. Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

server.tool(
  "send-some-monad",
  "Send some mon to another address",
  {
    to: z.string().describe("To Address"),
    amount: z.number().describe("Amount to send"),
  },
  async ({ to, amount }) => {
    try {
      const tx = await walletClient.sendTransaction({
        account,
        to,
        value: BigInt(amount * 1e18),
      });
      return {
        content: [
          {
            type: "text",
            text: `Transaction sent! Tx Hash: ${tx}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to send transaction. Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

server.tool(
  "list-tokens",
  "List available tokens for swapping",
  {},
  async () => {
    try {
      // Combine hardcoded and predefined tokens
      const hardcoded = [
        { symbol: "shMON", address: "0x3a98250F98Dd388C211206983453837C8365BDc1", decimals: 18 },
        { symbol: "USDT", address: "0x6a7436775c0d0B70cfF4c5365404ec37c9d9aF4b", decimals: 6 },
        { symbol: "CHOG", address: "0xE0590015A873bF326bd645c3E1266d4db41C4E6B", decimals: 18 },
        { symbol: "WMON", address: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701", decimals: 18 },
      ];

      const combinedTokens = [...hardcoded, ...tokensList.filter(t => !hardcoded.some(h => h.symbol === t.symbol))];

      return {
        content: [
          {
            type: "text",
            text: "Available Tokens:\n" + 
              combinedTokens.map(t => 
                `${t.symbol} (Address: ${t.address}, Decimals: ${t.decimals})`
              ).join('\n')
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Failed to list tokens: ${error.message}` }
        ]
      };
    }
  }
);

async function resolveToken(input) {
  if (!input) throw new Error("Invalid token input");

  // Native token handling
  if (input === 'MON' || input === 'NATIVE') {
    return { symbol: 'MON', address: 'NATIVE', decimals: 18 };
  }

  // Hardcoded token addresses and decimals
  const hardcoded = {
    "0x3a98250F98Dd388C211206983453837C8365BDc1": { symbol: "shMON", decimals: 18 },
    "0x6a7436775c0d0B70cfF4c5365404ec37c9d9aF4b": { symbol: "USDT", decimals: 6 },
    "0xE0590015A873bF326bd645c3E1266d4db41C4E6B": { symbol: "CHOG", decimals: 18 },
    "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701": { symbol: "WMON", decimals: 18 },
  };

  // Check if input is a known address
  if (hardcoded[input]) {
    return { ...hardcoded[input], address: input };
  }

  // Try to find by symbol
  const match = tokensList.find(t => t.symbol.toLowerCase() === input.toLowerCase());
  if (match) return match;

  throw new Error(`Token not found or decimals missing for: ${input}`);
}

server.tool(
  "uniswap-quote",
  "Get Quote for Uniswap V3 DEX Swap",
  {
    fromToken: z.string().describe("Source token symbol or address"),
    toToken: z.string().describe("Destination token symbol or address"),
    amount: z.number().positive().describe("Amount to swap")
  },
  async ({ fromToken, toToken, amount }) => {
    try {
      const from = await resolveToken(fromToken);
      const to = await resolveToken(toToken);

      const quote = await getUniswapV3Quote(from, to, amount);

      return {
        content: [
          { 
            type: "text", 
            text: `Uniswap V3 Swap Quote:\n` +
                  `From: ${from.symbol} (${from.address})\n` +
                  `To: ${to.symbol} (${to.address})\n` +
                  `Input Amount: ${amount} ${from.symbol}\n` +
                  `Expected Output: ${quote.amountOut.toFixed(6)} ${to.symbol}\n` +
                  `Minimum Output (1% slippage): ${quote.minAmountOut.toFixed(6)} ${to.symbol}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Quote failed: ${error.message}` }
        ]
      };
    }
  }
);

server.tool(
  "approve-token",
  "Approve tokens for spending",
  {
    tokenAddress: z.string().describe("Token Address"),
    amount: z.number().positive().describe("Amount to approve")
  },
  async ({ tokenAddress, amount }) => {
    try {
      const hash = await approveToken(tokenAddress, ROUTER_ADDRESS, amount);
      return {
        content: [
          { 
            type: "text", 
            text: hash 
              ? `Token approved! Tx Hash: ${hash}` 
              : "Existing allowance is sufficient."
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Approval failed: ${error.message}` }
        ]
      };
    }
  }
);

server.tool(
  "uniswap-swap",
  "Swap tokens on Uniswap V3 DEX",
  {
    fromToken: z.string().describe("Source token symbol or address"),
    toToken: z.string().describe("Destination token symbol or address"),
    amount: z.number().positive().describe("Amount to swap")
  },
  async ({ fromToken, toToken, amount }) => {
    try {
      const from = await resolveToken(fromToken);
      const to = await resolveToken(toToken);

      const result = await swapWithUniswapV3(from, to, amount, account.address);

      return {
        content: [
          { 
            type: "text", 
            text: `Uniswap V3 Swap Executed:\n` +
                  `From: ${from.symbol} (${from.address})\n` +
                  `To: ${to.symbol} (${to.address})\n` +
                  `Input Amount: ${amount} ${from.symbol}\n` +
                  `Expected Output: ${result.quote.amountOut.toFixed(6)} ${to.symbol}\n` +
                  `Minimum Output: ${result.quote.minAmountOut.toFixed(6)} ${to.symbol}\n` +
                  `Transaction Hash: ${result.hash}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Swap failed: ${error.message}` }
        ]
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});