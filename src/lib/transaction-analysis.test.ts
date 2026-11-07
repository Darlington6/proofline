import { describe, expect, it } from "vitest";
import {
  analyzeTransaction,
  createPreparedTransferAnalysis,
  createRiskFixtureAnalysis,
} from "./transaction-analysis";

function transactionWith(instruction: Record<string, unknown>, fee = 5_000) {
  return {
    slot: 123,
    meta: {
      err: null,
      fee,
    },
    transaction: {
      message: {
        accountKeys: [
          { pubkey: "wallet111111111111111111111111111111111", signer: true },
          { pubkey: "receiver11111111111111111111111111111111", signer: false },
        ],
        instructions: [instruction],
      },
    },
  };
}

describe("transaction analysis", () => {
  it("keeps a self-transfer low risk", () => {
    const analysis = createPreparedTransferAnalysis(
      "wallet111111111111111111111111111111111",
    );

    expect(analysis.riskLevel).toBe("low");
    expect(analysis.risks.every((risk) => risk.severity === "clear")).toBe(
      true,
    );
  });

  it("flags SOL sent away from the fee payer", () => {
    const analysis = analyzeTransaction(
      "signature",
      transactionWith({
        program: "system",
        parsed: {
          type: "transfer",
          info: {
            source: "wallet111111111111111111111111111111111",
            destination: "receiver11111111111111111111111111111111",
            lamports: 1_000_000,
          },
        },
      }),
    );

    expect(analysis.riskLevel).toBe("medium");
    expect(
      analysis.risks.find((risk) => risk.key === "funds-leaving-wallet")
        ?.severity,
    ).toBe("review");
  });

  it("flags token approvals as high risk", () => {
    const analysis = analyzeTransaction(
      "signature",
      transactionWith({
        program: "spl-token",
        parsed: { type: "approve", info: {} },
      }),
    );

    expect(analysis.riskLevel).toBe("high");
    expect(
      analysis.risks.find((risk) => risk.key === "token-approval")?.severity,
    ).toBe("high");
  });

  it("flags unknown programs and large fees", () => {
    const analysis = analyzeTransaction(
      "signature",
      transactionWith(
        {
          program: "unrecognized-program",
          parsed: { type: "execute", info: {} },
        },
        20_000_000,
      ),
    );

    expect(analysis.riskLevel).toBe("medium");
    expect(
      analysis.risks.find((risk) => risk.key === "unknown-program")?.severity,
    ).toBe("review");
    expect(
      analysis.risks.find((risk) => risk.key === "large-fee")?.severity,
    ).toBe("review");
  });

  it("creates a medium-risk unknown-program fixture", () => {
    const analysis = createRiskFixtureAnalysis("medium-unknown-program");

    expect(analysis.riskLevel).toBe("medium");
    expect(analysis.instructions[0]?.program).toBe("Unknown Program");
  });

  it("creates a high-risk token-approval fixture", () => {
    const analysis = createRiskFixtureAnalysis("high-token-approval");

    expect(analysis.riskLevel).toBe("high");
    expect(
      analysis.risks.find((risk) => risk.key === "token-approval")?.severity,
    ).toBe("high");
  });
});
