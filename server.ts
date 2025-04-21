import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from 'dotenv';

dotenv.config();

const server = new McpServer({
  name: "monad-testnet",
  version: "1.1.0"
});

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

const account = privateKeyToAccount(PRIVATE_KEY);

const client = createPublicClient({
    chain: monadTestnet,
    transport: http(),
});

const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
});


server.tool(
    "get-balance",
    "Get Balance of an account",
    {
        address: z.string().describe("Account Address"),
    },
    async ({ address }) => {
        try {
            const balance = await client.getBalance({
                address: address as `0x${string}`,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Balance for ${address}: ${formatUnits(balance, 18)} MON`,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve balance for address: ${address}. Error: ${
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
            const tx = await wallet.sendTransaction({
                account,
                to: to as `0x${string}`,
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