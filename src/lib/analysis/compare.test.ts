import { describe, expect, it } from "vitest";
import { compareWalletVersion } from "./compare";
import type { InstructionView, RiskLevel, TransactionAnalysis } from "./types";

const WALLET = "8dnTsVnjXQv96S7R85zZQjDv7ajuEhr8QfJwC9kL8aeU";

function ix(action: string, program: string): InstructionView {
  return {
    programAddress: program,
    program,
    known: true,
    action,
    detail: "",
    level: "safe",
    inner: false,
  };
}

const transfer = ix("SOL transfer", "System Program");
const priorityFee = ix("Compute budget request", "Compute Budget Program");

function checked(
  instructions: InstructionView[],
  {
    riskLevel = "medium" as RiskLevel,
    feeSol = 0.000005,
    lamportsAfter = 990_000_000,
    err = null as unknown,
  } = {},
) {
  const analysis: TransactionAnalysis = {
    signature: "unsigned",
    wallet: WALLET,
    feePayer: WALLET,
    signers: [WALLET],
    slot: null,
    feeSol,
    status: "simulated",
    instructions,
    balanceChanges: {
      sol: [
        {
          address: WALLET,
          label: "Your wallet",
          lamportsBefore: 1_000_000_000,
          lamportsAfter,
        },
      ],
      tokens: [],
    },
    simulation: { err, logs: [], unitsConsumed: 450 },
    riskLevel,
    riskSummary: "",
    risks: [],
  };
  return { analysis, riskLevel };
}

describe("compareWalletVersion", () => {
  it("allows a wallet that only adds a small priority fee", () => {
    const change = compareWalletVersion(
      checked([transfer]),
      checked([priorityFee, priorityFee, transfer], {
        lamportsAfter: 989_990_000,
      }),
    );
    expect(change.blockedReason).toBeNull();
    expect(change.added).toEqual([
      "Compute budget request (Compute Budget Program)",
      "Compute budget request (Compute Budget Program)",
    ]);
    expect(change.removed).toEqual([]);
    expect(change.extraCostLamports).toBe(10_000);
  });

  it("blocks a version that is riskier", () => {
    const change = compareWalletVersion(
      checked([transfer], { riskLevel: "low" }),
      checked([transfer], { riskLevel: "medium" }),
    );
    expect(change.blockedReason).toContain("medium risk");
  });

  it("blocks a version that takes more SOL from the wallet", () => {
    const change = compareWalletVersion(
      checked([transfer]),
      checked([transfer, transfer], { lamportsAfter: 980_000_000 }),
    );
    expect(change.blockedReason).toContain("SOL more");
  });

  it("blocks a version that fails simulation", () => {
    const change = compareWalletVersion(
      checked([transfer]),
      checked([transfer], { err: "InsufficientFundsForFee" }),
    );
    expect(change.blockedReason).toContain("fails simulation");
  });
});
