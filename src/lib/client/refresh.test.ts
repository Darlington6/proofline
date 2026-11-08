import { describe, expect, it } from "vitest";
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
} from "@solana/kit";
import { withBlockhash } from "./refresh";

const WALLET = address("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const SYSTEM = address("11111111111111111111111111111111");
const OLD = blockhash("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N");
const NEW = blockhash("GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi");

function build(instructions: Instruction[]) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(WALLET), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: OLD, lastValidBlockHeight: 0n },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

function readMessage(base64: string) {
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(base64),
  );
  return getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );
}

describe("withBlockhash", () => {
  it("swaps only the blockhash", () => {
    const transfer = {
      programAddress: SYSTEM,
      accounts: [],
      data: new Uint8Array([2, 0, 0, 0, 64, 66, 15, 0, 0, 0, 0, 0]),
    };
    const original = build([transfer]);
    const refreshed = withBlockhash(original, NEW);

    expect(refreshed).not.toBeNull();
    const before = readMessage(original);
    const after = readMessage(refreshed!);
    expect(after.lifetimeToken).toBe(NEW);
    expect({ ...after, lifetimeToken: OLD }).toEqual(before);
  });

  it("leaves durable-nonce transactions alone", () => {
    const advanceNonce = {
      programAddress: SYSTEM,
      accounts: [],
      data: new Uint8Array([4, 0, 0, 0]),
    };
    expect(withBlockhash(build([advanceNonce]), NEW)).toBeNull();
  });
});
