import type { RiskLevel, TransactionAnalysis } from "./types";

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** Extra SOL the wallet's version may cost (for example a priority fee). */
export const MAX_EXTRA_COST_LAMPORTS = 1_000_000; // 0.001 SOL

type Checked = { analysis: TransactionAnalysis; riskLevel: RiskLevel };

export type WalletChange = {
  added: string[];
  removed: string[];
  extraCostLamports: number;
  /** Why the wallet's version must not be sent, or null if it is safe to send. */
  blockedReason: string | null;
};

function topLevel(analysis: TransactionAnalysis) {
  return analysis.instructions
    .filter((ix) => !ix.inner)
    .map((ix) => `${ix.action} (${ix.program})`);
}

/** Items in `a` that are not in `b`, counting duplicates. */
function difference(a: string[], b: string[]) {
  const remaining = [...b];
  return a.filter((item) => {
    const index = remaining.indexOf(item);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}

function walletLoss(analysis: TransactionAnalysis) {
  const entry = analysis.balanceChanges.sol.find(
    (change) => change.address === analysis.wallet,
  );
  // The simulated balance already has the fee taken off.
  return entry
    ? entry.lamportsBefore - entry.lamportsAfter
    : Math.round(analysis.feeSol * 1e9);
}

/**
 * Compare the transaction Proofline checked with the version the wallet
 * signed. The wallet's version may only be sent if it is no riskier, still
 * simulates, and costs at most a small extra amount.
 */
export function compareWalletVersion(
  checked: Checked,
  signed: Checked,
): WalletChange {
  const before = topLevel(checked.analysis);
  const after = topLevel(signed.analysis);
  const extraCostLamports =
    walletLoss(signed.analysis) - walletLoss(checked.analysis);

  let blockedReason: string | null = null;
  if (signed.analysis.simulation?.err || signed.analysis.status === "failed") {
    blockedReason =
      "Your wallet changed the transaction and its version fails simulation, so it was not sent.";
  } else if (RANK[signed.riskLevel] > RANK[checked.riskLevel]) {
    blockedReason = `Your wallet changed the transaction and its version is ${signed.riskLevel} risk, so it was not sent.`;
  } else if (extraCostLamports > MAX_EXTRA_COST_LAMPORTS) {
    blockedReason = `Your wallet changed the transaction and its version costs ${(
      extraCostLamports / 1e9
    ).toFixed(6)} SOL more, so it was not sent.`;
  }

  return {
    added: difference(after, before),
    removed: difference(before, after),
    extraCostLamports,
    blockedReason,
  };
}
