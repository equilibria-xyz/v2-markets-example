import "dotenv/config";
import {
  approveOperator,
  approveUSDC,
  fetchChainLivePrices2,
  fetchMarketOracles2,
  fetchMarketSnapshots2,
  fetchProtocolParameters,
  modifyPosition,
} from "@/libs/markets";
import {
  Chains,
  DefaultChain,
  SupportedChainId,
  chains,
  isSupportedChain,
} from "@/constants/network";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  formatUnits,
  getContract,
  http,
  zeroAddress,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { MaxUint256 } from "./constants/units";
import USDC from "@abi/USDC.abi";
import { MultiInvoker2Addresses, USDCAddresses } from "./constants/contracts";
import { PositionSide2 } from "./constants/markets";
console.log(" ");
console.log(" ");
console.log("🌸 Perennial V2 - Contract Read/Write");

/// CONFIG
// Chain & Public Client
const chainId =
  ((process.env.CHAIN_ID &&
    parseInt(process.env.CHAIN_ID)) as SupportedChainId) || DefaultChain.id;
if (chainId && !isSupportedChain(chainId)) throw new Error("Unsupported Chain");

// Alchemy Key
const AlchemyProdKey = process.env.ALCHEMY_KEY;
if (!AlchemyProdKey) throw new Error("Missing alchemy key configuration");

const mnemonic =
  "liar region immune wait pretty cause art loop absorb fitness narrow amount";

const url = "http://127.0.0.1:8545";
const chain = Chains[chainId];

console.log(
  "Please use the following command to fork the chain so we can simulate responses:"
);
console.log(
  `\x1b[33manvil --fork-url https://arb-goerli.g.alchemy.com/v2/${AlchemyProdKey} -m "${mnemonic}" \x1b[0m`
);

// Wait for the enter key to continue the script
console.log("Press ENTER to continue...");
process.stdin.on("data", (data) => {
  if (data.toString() === "\n") {
    main();
  }
});

const main = async () => {
  // Create Public Client
  const publicClient = createPublicClient({
    chain,
    transport: http(url, { batch: true }),
  });

  console.log(`⛓️ Setup for ${publicClient.chain.name}(${chainId})`);

  // Account & Wallet Client
  const account = mnemonicToAccount(mnemonic);
  const walletClient = createWalletClient({
    // Transport
    transport: http(url, { batch: true }),
    chain: chains.find((c) => c.id === chainId)!,
    account,
  });
  console.log(`💳 Using the following wallet: ${account.address}`);

  ///// ACTIONS
  ///READ
  console.log(" ");
  console.log("--- READ Operations ---");
  console.log(" ");

  // Fetch Protocol wide parameters
  console.time("📓 Fetching Protocol Parameters");
  const protocolParameters = await fetchProtocolParameters(publicClient);
  console.timeEnd("📓 Fetching Protocol Parameters");
  // console.log(protocolParameters);

  // Fetch Market Snapshots for all Markets & Specified user on a given chain
  console.time("💽 Fetching Market Snapshots");
  const snapshots = await fetchMarketSnapshots2(publicClient, account.address);
  console.timeEnd("💽 Fetching Market Snapshots");
  console.log(snapshots);

  // // Fetch Market Configuration
  // // NOTE: Included in useMarketSnapshots2()
  // console.time("Fetching Market Configuration");
  // const marketOracles = await fetchMarketOracles2(publicClient);
  // console.timeEnd("Fetching Market Configuration");
  //   console.log(marketOracles);

  //   // Get current onchain prices
  //   // NOTE: Can be different to last snapshot price
  //   console.time("Fetching Oracle Prices");
  //   const prices = await fetchChainLivePrices2(publicClient);
  //   console.timeEnd("Fetching Oracle Prices");
  //   console.log(prices);

  // Write
  console.log(" ");
  console.log("--- WRITE Operations ---");
  console.log(" ");

  // Mint user USDC (Only on Goerli)
  const usdc = getContract({
    abi: USDC,
    address: USDCAddresses[chainId],
    publicClient,
    walletClient,
  });
  await usdc.write.mint([account.address, 10000000000n], {
    chainId,
    chain,
    gas: 69420n, // Required some value for testing.
  });
  const balance = await usdc.read.balanceOf([account.address]);
  console.log(`💰 Added $${formatUnits(balance, 6)} USDC to User Account`);

  // Approve MultiInvoker!
  const approveHash = await approveUSDC(walletClient, publicClient, MaxUint256);
  const approveTXReceipt = await publicClient.waitForTransactionReceipt({
    hash: approveHash,
  });

  if (approveTXReceipt.status === "reverted") {
    throw new Error("Transaction failed");
  } else {
    console.log(`💸 USDC approved for MultiInvoker2`);
  }

  // Approve Multiinvoker to the MarketFactory
  const approveOps = await approveOperator(
    walletClient,
    MultiInvoker2Addresses[chainId]
  );
  const approveOpsReceipt = await publicClient.waitForTransactionReceipt({
    hash: approveOps,
  });
  if (approveOpsReceipt.status === "reverted") {
    throw new Error("Transaction failed");
  } else {
    console.log(`🏭 MultiInvoker approved for MarketFactory`);
  }

  // Create an ETH Long Position
  const modifyReceipt = await modifyPosition(
    publicClient,
    walletClient,
    snapshots?.market.eth.market || zeroAddress,
    {
      positionSide: PositionSide2["long"],
      positionAbs: 1000000n, /// Denomainted in ETH (6 Decimals)
      collateralDelta: 1000000000n, /// Denominated in USDC (6 Decimals)
    }
  );

  if (!modifyReceipt) throw new Error("Transaction failed");

  const modifyReceiptTX = await publicClient.waitForTransactionReceipt({
    hash: modifyReceipt,
  });
  if (modifyReceiptTX.status === "reverted") {
    throw new Error("Transaction failed");
  } else {
    console.log(`📝 1 ETH Long Opened w/ 1000 USDC collateral`);
  }
};
