import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  address,
  type Address,
  type GetLatestBlockhashApi,
  type GetMinimumBalanceForRentExemptionApi,
  type Instruction,
  type Rpc,
} from "@solana/kit";
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getApproveInstruction,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
} from "@solana-program/token";
import { COMPUTE_BUDGET_PROGRAM } from "@/lib/analysis/programs";

export type ScenarioKind = "self-transfer" | "send-out" | "token-approval";

export const SCENARIOS: Record<
  ScenarioKind,
  { label: string; expected: "low" | "medium" | "high"; description: string }
> = {
  "self-transfer": {
    label: "Send 0.001 SOL to yourself",
    expected: "low",
    description: "A harmless transfer back to your own wallet.",
  },
  "send-out": {
    label: "Send 0.01 SOL to a new address",
    expected: "medium",
    description: "Real Devnet SOL leaves your wallet for a throwaway address.",
  },
  "token-approval": {
    label: "Approve unlimited token spending",
    expected: "high",
    description:
      "Creates a test token, then gives a stranger permission to spend all of it. This is how many wallet drainers work.",
  },
};

type ScenarioRpc = Rpc<
  GetLatestBlockhashApi & GetMinimumBalanceForRentExemptionApi
>;

const U64_MAX = 0xffff_ffff_ffff_ffffn;

// Compute units each scenario may use (actual use is well below these).
const COMPUTE_LIMIT: Record<ScenarioKind, number> = {
  "self-transfer": 10_000,
  "send-out": 10_000,
  "token-approval": 100_000,
};
const PRIORITY_MICRO_LAMPORTS = 1_000n; // per unit; under 0.000001 SOL total

/**
 * Wallets such as Phantom add their own priority fee while signing when a
 * transaction has none, which changes the bytes Proofline checked. Setting
 * the compute budget up front avoids most of those edits.
 */
export function computeBudget(units: number): Instruction[] {
  const limit = new Uint8Array(5);
  limit[0] = 2; // SetComputeUnitLimit
  new DataView(limit.buffer).setUint32(1, units, true);
  const price = new Uint8Array(9);
  price[0] = 3; // SetComputeUnitPrice
  new DataView(price.buffer).setBigUint64(1, PRIORITY_MICRO_LAMPORTS, true);
  const programAddress = address(COMPUTE_BUDGET_PROGRAM);
  return [
    { programAddress, data: limit },
    { programAddress, data: price },
  ];
}

async function instructionsFor(
  kind: ScenarioKind,
  wallet: Address,
  rpc: ScenarioRpc,
): Promise<Instruction[]> {
  // A no-op signer marks the wallet as a required signer without signing.
  // The real wallet signs later, only if the user approves.
  const owner = createNoopSigner(wallet);

  if (kind === "self-transfer") {
    return [
      getTransferSolInstruction({
        source: owner,
        destination: wallet,
        amount: 1_000_000n,
      }),
    ];
  }

  if (kind === "send-out") {
    const recipient = await generateKeyPairSigner();
    return [
      getTransferSolInstruction({
        source: owner,
        destination: recipient.address,
        amount: 10_000_000n,
      }),
    ];
  }

  // token-approval: new mint -> your token account -> mint 1,000 -> approve
  // an unknown delegate for the maximum amount.
  const mint = createNoopSigner((await generateKeyPairSigner()).address);
  const delegate = (await generateKeyPairSigner()).address;
  const [tokenAccount] = await findAssociatedTokenPda({
    owner: wallet,
    mint: mint.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const rent = await rpc
    .getMinimumBalanceForRentExemption(BigInt(getMintSize()))
    .send();

  return [
    getCreateAccountInstruction({
      payer: owner,
      newAccount: mint,
      lamports: rent,
      space: getMintSize(),
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: 6,
      mintAuthority: wallet,
    }),
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: owner,
      owner: wallet,
      mint: mint.address,
    }),
    getMintToInstruction({
      mint: mint.address,
      token: tokenAccount,
      mintAuthority: owner,
      amount: 1_000_000_000n,
    }),
    getApproveInstruction({
      source: tokenAccount,
      delegate,
      owner,
      amount: U64_MAX,
    }),
  ];
}

/** Compile instructions into an unsigned v0 transaction paid by `wallet`. */
export async function compileForWallet(
  instructions: Instruction[],
  wallet: Address,
  rpc: Rpc<GetLatestBlockhashApi>,
) {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(wallet), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  return getBase64EncodedWireTransaction(compileTransaction(message));
}

/** Build an unsigned, base64-encoded Devnet transaction for a scenario. */
export async function buildScenario(
  kind: ScenarioKind,
  wallet: Address,
  rpc: ScenarioRpc,
) {
  const instructions = [
    ...computeBudget(COMPUTE_LIMIT[kind]),
    ...(await instructionsFor(kind, wallet, rpc)),
  ];
  return compileForWallet(instructions, wallet, rpc);
}
