import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { monadTestnet } from "viem/chains";
import { configDotenv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

configDotenv();

const PRIVATE_KEY = "0xf7f250c896c842425be43681e7bacf819ff2e1d78efe7211a6d5a2b60a18e296";
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
});
const walletClient = createWalletClient({
    chain: monadTestnet,
    transport: http(),
});

export {
    walletClient,
    publicClient,
    account,
};
