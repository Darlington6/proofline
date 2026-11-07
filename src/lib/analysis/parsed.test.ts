import { describe, expect, it } from "vitest";
import { decodeInstruction } from "./decode";
import { rawFromParsed } from "./parsed";
import { SYSTEM_PROGRAM, TOKEN_PROGRAM } from "./programs";

const WALLET = "8dnTsVnjXQv96S7R85zZQjDv7ajuEhr8QfJwC9kL8aeU";
const DELEGATE = "D7Nr27hSE11PvTFQ24PJK4WrrP4n1UoUC6bqrAUvLNE2";
const ACCOUNT = "AhSmSrxSSiT9m4KKBQ8dXbXeSz1dzVEx1LKJw82Zf6a2";

describe("rawFromParsed", () => {
  it("rebuilds a parsed token approval so the decoder sees its effects", () => {
    const raw = rawFromParsed(
      {
        program: "spl-token",
        programId: TOKEN_PROGRAM,
        parsed: {
          type: "approve",
          info: {
            source: ACCOUNT,
            delegate: DELEGATE,
            owner: WALLET,
            amount: "18446744073709551615",
          },
        },
      },
      2,
    );
    expect(raw?.parentIndex).toBe(2);
    const decoded = decodeInstruction(raw!, { wallet: WALLET });
    expect(decoded.action).toBe("Token approval");
    expect(decoded.effects[0]).toMatchObject({
      kind: "token-approval",
      authority: WALLET,
      delegate: DELEGATE,
      amount: 0xffff_ffff_ffff_ffffn,
    });
  });

  it("rebuilds a parsed system createAccount", () => {
    const raw = rawFromParsed(
      {
        program: "system",
        programId: SYSTEM_PROGRAM,
        parsed: {
          type: "createAccount",
          info: {
            source: WALLET,
            newAccount: ACCOUNT,
            lamports: 1488440,
            space: 165,
            owner: TOKEN_PROGRAM,
          },
        },
      },
      0,
    );
    const decoded = decodeInstruction(raw!, { wallet: WALLET });
    expect(decoded.action).toBe("Create account");
    expect(decoded.detail).toContain("Token Program");
  });

  it("keeps unknown parsed types visible for review", () => {
    const raw = rawFromParsed(
      {
        program: "spl-token",
        programId: TOKEN_PROGRAM,
        parsed: { type: "somethingNew", info: {} },
      },
      0,
    );
    const decoded = decodeInstruction(raw!, { wallet: WALLET });
    expect(decoded.level).toBe("review");
  });
});
