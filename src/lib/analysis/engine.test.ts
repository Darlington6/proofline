import { describe, expect, it } from "vitest";
import { address, createNoopSigner, type Instruction } from "@solana/kit";
import {
  getAssignInstruction,
  getTransferSolInstruction,
} from "@solana-program/system";
import {
  getApproveCheckedInstruction,
  getApproveInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
} from "@solana-program/token";
import { estimateFeeLamports } from "./decode";
import { analyze, maxRisk, type AnalyzeInput } from "./engine";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  MEMO_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
} from "./programs";
import type { RawInstruction, TokenChange } from "./types";

const WALLET = address("8dnTsVnjXQv96S7R85zZQjDv7ajuEhr8QfJwC9kL8aeU");
const OTHER = address("9ns8pnjXHVyfRmyX7m3wW9n7e1d1PJ8Yj5g3NRcmfnV8");
const DELEGATE = address("D7Nr27hSE11PvTFQ24PJK4WrrP4n1UoUC6bqrAUvLNE2");
const TOKEN_ACCOUNT = address("AhSmSrxSSiT9m4KKBQ8dXbXeSz1dzVEx1LKJw82Zf6a2");
const MINT = address("3RUZp59etW65bH8B78mLn6myKi3a2qBf5JuKXPEztGK3");
const UNKNOWN_PROGRAM = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const wallet = createNoopSigner(WALLET);
const U64_MAX = 0xffff_ffff_ffff_ffffn;

function raw(ix: Instruction, parentIndex?: number): RawInstruction {
  return {
    programAddress: ix.programAddress,
    accounts: (ix.accounts ?? []).map((a) => a.address),
    data: new Uint8Array(ix.data ?? []),
    parentIndex,
  };
}

function input(overrides: Partial<AnalyzeInput>): AnalyzeInput {
  return {
    signature: "unsigned",
    wallet: WALLET,
    feePayer: WALLET,
    signers: [WALLET],
    slot: null,
    feeLamports: 5_000n,
    status: "simulated",
    instructions: [],
    innerInstructions: [],
    balanceChanges: { sol: [], tokens: [] },
    simulation: { err: null, logs: [], unitsConsumed: 150 },
    ...overrides,
  };
}

function risk(result: ReturnType<typeof analyze>, key: string) {
  return result.risks.find((r) => r.key === key)?.severity;
}

const walletTokenAccount = (overrides: Partial<TokenChange>): TokenChange => ({
  account: TOKEN_ACCOUNT,
  owner: WALLET,
  mint: MINT,
  decimals: 6,
  amountBefore: "1000000",
  amountAfter: "1000000",
  delegateBefore: null,
  delegateAfter: null,
  delegatedAmountAfter: "0",
  ...overrides,
});

describe("analyze", () => {
  it("keeps a self-transfer low risk", () => {
    const result = analyze(
      input({
        instructions: [
          raw(
            getTransferSolInstruction({
              source: wallet,
              destination: WALLET,
              amount: 1_000_000n,
            }),
          ),
        ],
      }),
    );
    expect(result.riskLevel).toBe("low");
    expect(result.instructions[0].action).toBe("SOL self-transfer");
  });

  it("flags SOL sent to another address", () => {
    const result = analyze(
      input({
        instructions: [
          raw(
            getTransferSolInstruction({
              source: wallet,
              destination: OTHER,
              amount: 10_000_000n,
            }),
          ),
        ],
      }),
    );
    expect(result.riskLevel).toBe("medium");
    expect(risk(result, "funds-leaving-wallet")).toBe("review");
    expect(result.risks[0].detail).toContain("0.0100 SOL");
  });

  it("flags an unlimited token approval as high risk", () => {
    const result = analyze(
      input({
        instructions: [
          raw(
            getApproveInstruction({
              source: TOKEN_ACCOUNT,
              delegate: DELEGATE,
              owner: wallet,
              amount: U64_MAX,
            }),
          ),
        ],
      }),
    );
    expect(result.riskLevel).toBe("high");
    expect(risk(result, "token-approval")).toBe("high");
    expect(result.instructions[0].detail).toContain("unlimited");
  });

  it("catches Token-2022 approvals", () => {
    const ix = getApproveCheckedInstruction(
      {
        source: TOKEN_ACCOUNT,
        mint: MINT,
        delegate: DELEGATE,
        owner: wallet,
        amount: 5n,
        decimals: 6,
      },
      { programAddress: TOKEN_2022_PROGRAM as never },
    );
    const result = analyze(input({ instructions: [raw(ix)] }));
    expect(result.instructions[0].program).toBe("Token-2022 Program");
    expect(risk(result, "token-approval")).toBe("high");
  });

  it("catches an approval hidden inside an unknown program", () => {
    const approve = raw(
      getApproveInstruction({
        source: TOKEN_ACCOUNT,
        delegate: DELEGATE,
        owner: wallet,
        amount: U64_MAX,
      }),
      0,
    );
    const result = analyze(
      input({
        instructions: [
          {
            programAddress: UNKNOWN_PROGRAM,
            accounts: [WALLET],
            data: new Uint8Array([1]),
          },
        ],
        innerInstructions: [approve],
      }),
    );
    expect(result.riskLevel).toBe("high");
    expect(risk(result, "unknown-program")).toBe("review");
    const inner = result.instructions.find((ix) => ix.inner);
    expect(inner?.action).toBe("Token approval");
    expect(inner?.invokedBy).toBe("9WzD...AWWM");
  });

  it("flags a delegate that only shows up in the simulated account state", () => {
    const result = analyze(
      input({
        instructions: [
          {
            programAddress: UNKNOWN_PROGRAM,
            accounts: [],
            data: new Uint8Array(),
          },
        ],
        balanceChanges: {
          sol: [],
          tokens: [walletTokenAccount({ delegateAfter: DELEGATE })],
        },
      }),
    );
    expect(risk(result, "token-approval")).toBe("high");
  });

  it("treats token transfers and balance drops as funds leaving", () => {
    const result = analyze(
      input({
        instructions: [
          raw(
            getTransferInstruction({
              source: TOKEN_ACCOUNT,
              destination: OTHER,
              authority: wallet,
              amount: 500n,
            }),
          ),
        ],
        balanceChanges: {
          sol: [],
          tokens: [walletTokenAccount({ amountAfter: "999500" })],
        },
      }),
    );
    expect(risk(result, "funds-leaving-wallet")).toBe("review");
  });

  it("recognises token account creation, memos, and compute budget", () => {
    const ata = getCreateAssociatedTokenIdempotentInstruction({
      payer: wallet,
      ata: TOKEN_ACCOUNT,
      owner: WALLET,
      mint: MINT,
    });
    const result = analyze(
      input({
        instructions: [
          {
            programAddress: COMPUTE_BUDGET_PROGRAM,
            accounts: [],
            data: new Uint8Array([2, 64, 13, 3, 0]),
          },
          raw(ata),
          {
            programAddress: MEMO_PROGRAM,
            accounts: [],
            data: new TextEncoder().encode("hello"),
          },
        ],
      }),
    );
    expect(result.riskLevel).toBe("low");
    expect(result.instructions.map((ix) => ix.program)).toEqual([
      "Compute Budget Program",
      "Associated Token Account Program",
      "Memo Program",
    ]);
    expect(ata.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM);
  });

  it("flags handing the wallet account to another program", () => {
    const result = analyze(
      input({
        instructions: [
          raw(
            getAssignInstruction({
              account: wallet,
              programAddress: address(UNKNOWN_PROGRAM),
            }),
          ),
        ],
      }),
    );
    expect(risk(result, "authority-change")).toBe("high");
  });

  it("treats a failed simulation as high risk", () => {
    const result = analyze(
      input({
        simulation: {
          err: { InstructionError: [0, "Custom"] },
          logs: [],
          unitsConsumed: 0,
        },
      }),
    );
    expect(result.riskLevel).toBe("high");
  });

  it("decodes unknown programs as needing review", () => {
    const result = analyze(
      input({
        instructions: [
          {
            programAddress: UNKNOWN_PROGRAM,
            accounts: [OTHER],
            data: new Uint8Array([9]),
          },
        ],
      }),
    );
    expect(result.riskLevel).toBe("medium");
    expect(result.instructions[0].known).toBe(false);
    expect(TOKEN_PROGRAM).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  });
});

describe("estimateFeeLamports", () => {
  it("charges 5,000 lamports per signature", () => {
    expect(estimateFeeLamports(2, [])).toBe(10_000n);
  });

  it("adds the priority fee from compute budget instructions", () => {
    const limit = new Uint8Array([2, 0x40, 0x0d, 0x03, 0x00]); // 200,000 units
    const price = new Uint8Array(9);
    price[0] = 3;
    new DataView(price.buffer).setBigUint64(1, 100_000_000n, true); // micro-lamports/unit
    const fee = estimateFeeLamports(1, [
      { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data: limit },
      { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data: price },
    ]);
    expect(fee).toBe(5_000n + 20_000_000n);
  });
});

describe("maxRisk", () => {
  it("never lowers the risk", () => {
    expect(maxRisk("high", "low")).toBe("high");
    expect(maxRisk("low", "medium")).toBe("medium");
  });
});
