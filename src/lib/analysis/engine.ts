import { decodeInstruction, formatSol, formatTokenAmount } from "./decode";
import { shortAddress } from "./programs";
import type {
  BalanceChanges,
  DecodedInstruction,
  Effect,
  InstructionView,
  RawInstruction,
  RiskCategory,
  RiskLevel,
  SimulationSummary,
  TransactionAnalysis,
} from "./types";

export const LARGE_FEE_SOL = 0.01;

export type AnalyzeInput = {
  signature: string;
  wallet: string;
  feePayer: string;
  signers: string[];
  slot: number | null;
  feeLamports: bigint;
  /** "simulated" for unsigned checks; confirmed/failed for history. */
  status: TransactionAnalysis["status"];
  instructions: RawInstruction[];
  innerInstructions: RawInstruction[];
  balanceChanges: BalanceChanges;
  simulation: SimulationSummary | null;
};

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

function decodeAll(input: AnalyzeInput) {
  const ctx = { wallet: input.wallet };
  const decoded: DecodedInstruction[] = [];

  input.instructions.forEach((ix, index) => {
    const top = decodeInstruction(ix, ctx);
    decoded.push(top);
    for (const inner of input.innerInstructions) {
      if (inner.parentIndex === index) {
        decoded.push(decodeInstruction(inner, ctx, top.program));
      }
    }
  });

  return decoded;
}

function effectsOf<K extends Effect["kind"]>(
  decoded: DecodedInstruction[],
  kind: K,
) {
  return decoded.flatMap((ix) =>
    ix.effects.filter(
      (e): e is Extract<Effect, { kind: K }> => e.kind === kind,
    ),
  );
}

/** Effects hold bigints for the rules; the API response leaves them out. */
function toView(ix: DecodedInstruction): InstructionView {
  const { effects, ...view } = ix;
  void effects;
  return view;
}

export function analyze(input: AnalyzeInput): TransactionAnalysis {
  const { wallet } = input;
  const decoded = decodeAll(input);
  const tokens = input.balanceChanges.tokens;
  const ownerOf = new Map(tokens.map((t) => [t.account, t.owner]));
  const walletOwns = (account: string) => ownerOf.get(account) === wallet;
  const feeSol = Number(input.feeLamports) / 1_000_000_000;
  const failed =
    input.status === "failed" || (input.simulation?.err ?? null) !== null;

  // Funds leaving the wallet: instruction-level transfers plus any real
  // decrease in a wallet-owned token account seen in the balance diff.
  const solOut = effectsOf(decoded, "sol-transfer").filter(
    (e) => e.from === wallet && e.to !== wallet,
  );
  const tokenOut = effectsOf(decoded, "token-transfer").filter(
    (e) =>
      (e.authority === wallet || walletOwns(e.source)) &&
      !walletOwns(e.destination),
  );
  const tokenDecreases = tokens.filter(
    (t) => t.owner === wallet && BigInt(t.amountAfter) < BigInt(t.amountBefore),
  );
  const fundsDetails = [
    ...solOut.map(
      (e) => `Sends ${formatSol(e.lamports)} to ${shortAddress(e.to)}.`,
    ),
    ...tokenOut.map((e) => `Moves tokens to ${shortAddress(e.destination)}.`),
    ...tokenDecreases
      .filter((t) => !tokenOut.some((e) => e.source === t.account))
      .map(
        (t) =>
          `Your token balance in ${shortAddress(t.account)} drops by ${formatTokenAmount(BigInt(t.amountBefore) - BigInt(t.amountAfter), t.decimals)}.`,
      ),
  ];

  // Approvals: the instruction itself, or a delegate that appears on a
  // wallet-owned token account after simulation (catches hidden CPI calls).
  const approvals = effectsOf(decoded, "token-approval").filter(
    (e) => e.authority === wallet || walletOwns(e.account),
  );
  const newDelegates = tokens.filter(
    (t) =>
      t.owner === wallet &&
      t.delegateAfter !== null &&
      t.delegateAfter !== t.delegateBefore,
  );
  const approvalDetails = [
    ...approvals.map(
      (e) =>
        `${shortAddress(e.delegate)} could move ${formatTokenAmount(e.amount, tokens.find((t) => t.account === e.account)?.decimals)} tokens from ${shortAddress(e.account)} without asking you again.`,
    ),
    ...newDelegates
      .filter((t) => !approvals.some((e) => e.account === t.account))
      .map(
        (t) =>
          `After this transaction, ${shortAddress(t.delegateAfter)} is a delegate on your token account ${shortAddress(t.account)}.`,
      ),
  ];

  // Authority changes: ownership of the wallet or its token accounts moves.
  const authorityChanges = effectsOf(decoded, "authority-change").filter(
    (e) => e.authority === wallet || walletOwns(e.account),
  );
  const walletAssigned = effectsOf(decoded, "account-assign").filter(
    (e) => e.account === wallet,
  );
  const closesToOthers = effectsOf(decoded, "close-account").filter(
    (e) =>
      (e.authority === wallet || walletOwns(e.account)) &&
      e.destination !== wallet,
  );
  const authorityHigh = authorityChanges.length + walletAssigned.length > 0;
  const authorityDetails = [
    ...authorityChanges.map(
      (e) =>
        `Control of ${shortAddress(e.account)} moves to ${e.newAuthority ? shortAddress(e.newAuthority) : "nobody (removed)"}.`,
    ),
    ...walletAssigned.map(
      (e) =>
        `Your wallet account would be handed to program ${shortAddress(e.newOwner)}.`,
    ),
    ...closesToOthers.map(
      (e) =>
        `Closes ${shortAddress(e.account)} and sends its balance to ${shortAddress(e.destination)}.`,
    ),
  ];

  const unknown = decoded.filter((ix) => !ix.known);
  const unknownNames = [...new Set(unknown.map((ix) => ix.program))];

  const risks: RiskCategory[] = [
    {
      key: "funds-leaving-wallet",
      label: "Funds leaving wallet",
      severity: fundsDetails.length > 0 ? "review" : "clear",
      detail:
        fundsDetails.length > 0
          ? fundsDetails.join(" ")
          : "No SOL or tokens leave your wallet, apart from the network fee and any rent for new accounts.",
    },
    {
      key: "token-approval",
      label: "Token approvals",
      severity: approvalDetails.length > 0 ? "high" : "clear",
      detail:
        approvalDetails.length > 0
          ? approvalDetails.join(" ")
          : "No account gains permission to spend your tokens.",
    },
    {
      key: "authority-change",
      label: "Authority changes",
      severity: authorityHigh
        ? "high"
        : closesToOthers.length > 0
          ? "review"
          : "clear",
      detail:
        authorityDetails.length > 0
          ? authorityDetails.join(" ")
          : "No change to who controls your wallet or token accounts.",
    },
    {
      key: "unknown-program",
      label: "Unknown programs",
      severity: unknown.length > 0 ? "review" : "clear",
      detail:
        unknown.length > 0
          ? `Proofline cannot decode ${unknownNames.join(", ")}${unknown.some((ix) => ix.inner) ? ", including calls made inside other programs" : ""}. Check that you trust this app.`
          : "Every instruction, including calls made inside other programs, uses a program Proofline recognises.",
    },
    {
      key: "large-fee",
      label: "Large fee",
      severity: feeSol > LARGE_FEE_SOL ? "review" : "clear",
      detail:
        feeSol > LARGE_FEE_SOL
          ? `The fee is ${feeSol.toFixed(4)} SOL, above the ${LARGE_FEE_SOL} SOL review threshold.`
          : `The fee is about ${feeSol.toFixed(6)} SOL.`,
    },
    {
      key: "failed-simulation",
      label: input.status === "simulated" ? "Simulation" : "Execution",
      severity: failed ? "high" : "clear",
      detail: failed
        ? input.status === "simulated"
          ? "The Devnet simulation failed. Signing would waste the fee or fail."
          : "This transaction failed on-chain."
        : input.status === "simulated"
          ? "The Devnet simulation succeeded."
          : "This transaction succeeded on-chain.",
    },
  ];

  const riskLevel: RiskLevel = risks.some((r) => r.severity === "high")
    ? "high"
    : risks.some((r) => r.severity === "review")
      ? "medium"
      : "low";
  const flagged = risks.filter((r) => r.severity !== "clear");

  return {
    signature: input.signature,
    wallet,
    feePayer: input.feePayer,
    signers: input.signers,
    slot: input.slot,
    feeSol,
    status: input.status,
    instructions: decoded.map(toView),
    balanceChanges: input.balanceChanges,
    simulation: input.simulation,
    riskLevel,
    riskSummary:
      flagged.length === 0
        ? "Nothing unusual found. Only common programs are used, and nothing leaves your wallet beyond the fee."
        : `Flagged: ${flagged.map((r) => r.label.toLowerCase()).join(", ")}.`,
    risks,
  };
}
