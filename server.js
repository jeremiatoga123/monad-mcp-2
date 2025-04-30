import { ethers } from "ethers";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { accountTokens } from "./src/checkbalance.js";
import { createPublicClient, createWalletClient, http } from "viem";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const RPC_URLS = ["https://testnet-rpc.monad.xyz"];
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const ROUTER_ADDRESS = "0xCa810D095e90Daae6e867c19DF6D9A8C56db2c89";
const WETH = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)"
];

const tokensList = [
  { symbol: 'MON', address: 'NATIVE', decimals: 18 },
  { symbol: 'WMON', address: WETH, decimals: 18 },
  { symbol: 'USDT', address: '0x6a7436775c0d0B70cfF4c5365404ec37c9d9aF4b', decimals: 6 },
  { symbol: 'CHOG', address: '0xE0590015A873bF326bd645c3E1266d4db41C4E6B', decimals: 18 }
];

function resolveToken(input) {
  const inputStr = input === null || input === undefined 
    ? '' 
    : String(input).trim();

  if (['mon', 'native', 'eth'].includes(inputStr.toLowerCase())) {
    return { 
      symbol: 'MON', 
      address: WETH, 
      decimals: 18
    };
  }
  const hardcoded = {
    "0x3a98250F98Dd388C211206983453837C8365BDc1": { symbol: "shMON", decimals: 18 },
    "0x6a7436775c0d0B70cfF4c5365404ec37c9d9aF4b": { symbol: "USDT", decimals: 6 },
    "0xE0590015A873bF326bd645c3E1266d4db41C4E6B": { symbol: "CHOG", decimals: 18 },
    "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701": { symbol: "WMON", decimals: 18 },
  };

  if (hardcoded[inputStr]) {
    return { ...hardcoded[inputStr], address: inputStr };
  }
  const match = tokensList.find(t => t.symbol.toLowerCase() === inputStr.toLowerCase());
  if (match) return match;

  throw new Error(`Token tidak ditemukan: ${input}`);
}
function createProvider() {
  return new ethers.JsonRpcProvider(RPC_URLS[0], {
    name: "Monad Testnet",
    chainId: 10143
  });
}
async function swapETHtoToken(privateKey, tokenAddress, ethAmount) {
  const provider = createProvider();
  const wallet = new ethers.Wallet(privateKey, provider);

  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
  const path = [WETH, tokenAddress];
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const ethAmountParsed = ethers.parseEther(ethAmount.toFixed(18));

  try {
    const tx = await router.swapExactETHForTokens(
      0, path, wallet.address, deadline,
      { value: ethAmountParsed, gasLimit: 300000 }
    );
    
    const receipt = await tx.wait();

    return {
      hash: tx.hash,
      status: receipt.status === 1 ? 'success' : 'failed',
      explorerUrl: EXPLORER_URL + tx.hash
    };
  } catch (err) {
    throw new Error(`Swap gagal: ${err.message}`);
  }
}

async function approveToken(privateKey, tokenAddress, amount) {
  const provider = createProvider();
  const wallet = new ethers.Wallet(privateKey, provider);

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  
  try {
    const tx = await token.approve(ROUTER_ADDRESS, 
      ethers.parseUnits(amount.toString(), 18)
    );
    
    const receipt = await tx.wait();

    return {
      hash: tx.hash,
      status: receipt.status === 1 ? 'success' : 'failed',
      explorerUrl: EXPLORER_URL + tx.hash
    };
  } catch (err) {
    throw new Error(`Approval gagal: ${err.message}`);
  }
}

const server = new McpServer({
  name: "monad-testnet",
  version: "1.1.0"
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY tidak ditemukan di environment variables");
  process.exit(1);
}

server.tool(
  "monad-swap",
  "Swap ETH ke Token di Monad Testnet",
  {
    toToken: z.string().describe("Alamat token tujuan"),
    amount: z.number().positive().describe("Jumlah ETH untuk di-swap")
  },
  async ({ toToken, amount }) => {
    try {
      const resolvedToken = resolveToken(toToken);
      const result = await swapETHtoToken(PRIVATE_KEY, resolvedToken.address, amount);

      return {
        content: [
          { 
            type: "text", 
            text: `Swap Berhasil:\n` +
                  `Token Tujuan: ${resolvedToken.symbol} (${resolvedToken.address})\n` +
                  `Jumlah ETH: ${amount}\n` +
                  `Status: ${result.status}\n` +
                  `Tx Hash: ${result.hash}\n` +
                  `Explorer: ${result.explorerUrl}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Swap Gagal: ${error.message}` }
        ]
      };
    }
  }
);
server.tool(
  "monad-approve",
  "Approve token untuk router di Monad Testnet",
  {
    tokenAddress: z.string().describe("Alamat token untuk approve"),
    amount: z.number().positive().describe("Jumlah token untuk approve")
  },
  async ({ tokenAddress, amount }) => {
    try {
      const resolvedToken = resolveToken(tokenAddress);
      const result = await approveToken(PRIVATE_KEY, resolvedToken.address, amount);

      return {
        content: [
          { 
            type: "text", 
            text: `Approval Berhasil:\n` +
                  `Token: ${resolvedToken.symbol} (${resolvedToken.address})\n` +
                  `Jumlah: ${amount}\n` +
                  `Status: ${result.status}\n` +
                  `Tx Hash: ${result.hash}\n` +
                  `Explorer: ${result.explorerUrl}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Approval Gagal: ${error.message}` }
        ]
      };
    }
  }
);

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});