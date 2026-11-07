import { afterEach, describe, expect, it, vi } from "vitest";
import {
  address,
  type Address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { inspectUnsignedTransaction } from "./inspect";
import { InputError } from "./rpc";

const WALLET = address("8dnTsVnjXQv96S7R85zZQjDv7ajuEhr8QfJwC9kL8aeU");
const OTHER = address("9ns8pnjXHVyfRmyX7m3wW9n7e1d1PJ8Yj5g3NRcmfnV8");
const SYSTEM = "11111111111111111111111111111111";

function transferTo(destination: Address) {
  const signer = createNoopSigner(WALLET);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"),
          lastValidBlockHeight: 100n,
        },
        m,
      ),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({
            source: signer,
            destination,
            amount: 10_000_000n,
          }),
        ],
        m,
      ),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

function account(lamports: number) {
  return { lamports, owner: SYSTEM, data: ["", "base64"] };
}

/** Fake Devnet RPC: answers getMultipleAccounts and simulateTransaction. */
function mockRpc(before: number[], after: number[], err: unknown = null) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(String(init.body)) as { method: string };
      calls.push(method);
      if (method === "getMultipleAccounts") {
        return Response.json({ result: { value: before.map(account) } });
      }
      return Response.json({
        result: {
          value: {
            err,
            logs: ["Program 11111111111111111111111111111111 success"],
            unitsConsumed: 150,
            accounts: after.map(account),
            innerInstructions: [],
          },
        },
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("inspectUnsignedTransaction", () => {
  it("decodes, simulates, and reports real balance changes", async () => {
    const calls = mockRpc([1_000_000_000, 0], [989_995_000, 10_000_000]);
    const result = await inspectUnsignedTransaction(transferTo(OTHER), WALLET);

    expect(calls).toEqual(["getMultipleAccounts", "simulateTransaction"]);
    expect(result.signableByWallet).toBe(true);
    expect(result.messageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.analysis.riskLevel).toBe("medium");
    expect(result.analysis.balanceChanges.sol).toEqual([
      expect.objectContaining({
        label: "Your wallet",
        lamportsBefore: 1_000_000_000,
        lamportsAfter: 989_995_000,
      }),
      expect.objectContaining({ address: OTHER, lamportsAfter: 10_000_000 }),
    ]);
  });

  it("is review-only when the connected wallet is not the signer", async () => {
    mockRpc([1_000_000_000, 0], [989_995_000, 10_000_000]);
    const result = await inspectUnsignedTransaction(transferTo(OTHER), OTHER);
    expect(result.signableByWallet).toBe(false);
  });

  it("marks a failed simulation as high risk", async () => {
    mockRpc([0, 0], [0, 0], "AccountNotFound");
    const result = await inspectUnsignedTransaction(transferTo(OTHER), WALLET);
    expect(result.analysis.riskLevel).toBe("high");
    expect(result.analysis.balanceChanges.sol).toEqual([]);
  });

  it("rejects payloads that are not transactions", async () => {
    await expect(inspectUnsignedTransaction("aGVsbG8=")).rejects.toBeInstanceOf(
      InputError,
    );
    await expect(
      inspectUnsignedTransaction("not base64!"),
    ).rejects.toBeInstanceOf(InputError);
    await expect(
      inspectUnsignedTransaction("A".repeat(2_000)),
    ).rejects.toBeInstanceOf(InputError);
  });
});
