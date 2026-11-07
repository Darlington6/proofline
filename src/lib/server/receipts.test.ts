import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { MEMO_PROGRAM } from "@/lib/analysis/programs";
import { formatReceiptMemo } from "@/lib/receipt";
import { verifyReceipt } from "./receipts";
import { InputError } from "./rpc";

const WALLET = address("8dnTsVnjXQv96S7R85zZQjDv7ajuEhr8QfJwC9kL8aeU");
const OTHER = address("9ns8pnjXHVyfRmyX7m3wW9n7e1d1PJ8Yj5g3NRcmfnV8");
const RECEIPT_SIG = "5".repeat(88);
const TX_SIG = "4".repeat(88);

function compile(instructions: Instruction[], payer: Address = WALLET) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(payer), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"),
          lastValidBlockHeight: 100n,
        },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = compileTransaction(message);
  return {
    wire: getBase64EncodedWireTransaction(transaction),
    hash: createHash("sha256")
      .update(new Uint8Array(transaction.messageBytes))
      .digest("hex"),
  };
}

const transfer = (payer: Address = WALLET) =>
  compile(
    [
      getTransferSolInstruction({
        source: createNoopSigner(payer),
        destination: OTHER,
        amount: 1n,
      }),
    ],
    payer,
  );

function receiptFor(messageHash: string) {
  return compile([
    {
      programAddress: address(MEMO_PROGRAM),
      accounts: [{ address: WALLET, role: AccountRole.READONLY_SIGNER }],
      data: new TextEncoder().encode(
        formatReceiptMemo({ riskLevel: "medium", messageHash }),
      ),
    },
  ]);
}

/** Fake RPC that serves getTransaction from a signature -> wire map. */
function mockTransactions(
  byId: Record<string, { wire: string; slot: number; err?: unknown }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body)) as { params: [string] };
      const entry = byId[params[0]];
      return Response.json({
        result: entry
          ? {
              slot: entry.slot,
              blockTime: 1_700_000_000,
              transaction: [entry.wire, "base64"],
              meta: { err: entry.err ?? null },
            }
          : null,
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("verifyReceipt", () => {
  it("verifies a transaction that matches its receipt", async () => {
    const tx = transfer();
    mockTransactions({
      [RECEIPT_SIG]: { wire: receiptFor(tx.hash).wire, slot: 10 },
      [TX_SIG]: { wire: tx.wire, slot: 12 },
    });
    const result = await verifyReceipt(RECEIPT_SIG, TX_SIG);
    expect(result.status).toBe("verified");
    if (result.status !== "verified") return;
    expect(result.receipt).toMatchObject({
      recorder: WALLET,
      riskLevel: "medium",
      messageHash: tx.hash,
    });
    expect(result.transaction).toMatchObject({
      sameMessage: true,
      sameWallet: true,
      recordedFirst: true,
      succeeded: true,
    });
  });

  it("detects a different transaction, wallet, and order", async () => {
    mockTransactions({
      [RECEIPT_SIG]: { wire: receiptFor("b".repeat(64)).wire, slot: 20 },
      [TX_SIG]: { wire: transfer(OTHER).wire, slot: 12 },
    });
    const result = await verifyReceipt(RECEIPT_SIG, TX_SIG);
    if (result.status !== "verified") throw new Error(result.status);
    expect(result.transaction).toMatchObject({
      sameMessage: false,
      sameWallet: false,
      recordedFirst: false,
    });
  });

  it("rejects transactions without a receipt memo", async () => {
    mockTransactions({ [RECEIPT_SIG]: { wire: transfer().wire, slot: 1 } });
    expect((await verifyReceipt(RECEIPT_SIG)).status).toBe("not-a-receipt");
  });

  it("treats a failed receipt transaction as no proof", async () => {
    mockTransactions({
      [RECEIPT_SIG]: {
        wire: receiptFor("c".repeat(64)).wire,
        slot: 1,
        err: { InstructionError: [0, "Custom"] },
      },
    });
    expect((await verifyReceipt(RECEIPT_SIG)).status).toBe("receipt-failed");
  });

  it("reports missing transactions and bad signatures", async () => {
    mockTransactions({});
    expect((await verifyReceipt(RECEIPT_SIG)).status).toBe("not-found");
    await expect(verifyReceipt("nope")).rejects.toBeInstanceOf(InputError);
  });
});
