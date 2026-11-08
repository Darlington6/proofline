import { MEMO_PROGRAM, MEMO_V1_PROGRAM } from "@/lib/analysis/programs";
import type { RiskLevel } from "@/lib/analysis/types";
import { parseReceiptMemo } from "@/lib/receipt";
import { fetchConfirmed, hashMessage } from "./inspect";
import { InputError } from "./rpc";

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export type ReceiptRecord = {
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Wallet that signed the memo. */
  recorder: string;
  riskLevel: RiskLevel;
  messageHash: string;
};

export type TransactionMatch = {
  signature: string;
  slot: number;
  blockTime: number | null;
  messageHash: string;
  succeeded: boolean;
  /** The transaction's message hashes to the receipt's fingerprint. */
  sameMessage: boolean;
  /** The receipt's wallet also signed the transaction. */
  sameWallet: boolean;
  /** The receipt landed in an earlier slot (or the same slot). */
  recordedFirst: boolean;
};

type ReceiptProblem = {
  status: "not-found" | "not-a-receipt" | "receipt-failed";
  message: string;
};

export type ReceiptVerification =
  | {
      status: "verified";
      receipt: ReceiptRecord;
      transaction: TransactionMatch | null;
    }
  | ReceiptProblem
  | {
      status: "transaction-not-found";
      receipt: ReceiptRecord;
      message: string;
    };

function checkSignature(value: string, label: string) {
  if (!SIGNATURE_PATTERN.test(value)) {
    throw new InputError(`The ${label} is not a valid transaction signature.`);
  }
}

async function readReceipt(
  signature: string,
): Promise<ReceiptRecord | ReceiptProblem> {
  const fetched = await fetchConfirmed(signature);
  if (!fetched) {
    return {
      status: "not-found",
      message:
        "Receipt transaction not found on Devnet. It may still be confirming.",
    };
  }
  const { result, parts } = fetched;

  for (const ix of parts.instructions) {
    if (
      ix.programAddress !== MEMO_PROGRAM &&
      ix.programAddress !== MEMO_V1_PROGRAM
    ) {
      continue;
    }
    const memo = parseReceiptMemo(new TextDecoder().decode(ix.data));
    if (!memo) continue;
    if (result.meta?.err) {
      return {
        status: "receipt-failed",
        message:
          "This receipt transaction failed on-chain, so it proves nothing.",
      };
    }
    // Memo v2 requires every listed account to sign, so a listed signer is
    // the wallet vouching for the note. Otherwise fall back to the fee payer.
    const recorder =
      ix.accounts.find((account) => parts.signers.includes(account)) ??
      parts.keys[0];
    return {
      signature,
      slot: result.slot,
      blockTime: result.blockTime,
      recorder,
      ...memo,
    };
  }

  return {
    status: "not-a-receipt",
    message: "That transaction does not contain a Proofline receipt memo.",
  };
}

/**
 * Verify a receipt and, optionally, that a signed transaction is exactly the
 * one the receipt says Proofline checked.
 */
export async function verifyReceipt(
  receiptSignature: string,
  transactionSignature?: string,
): Promise<ReceiptVerification> {
  checkSignature(receiptSignature, "receipt");
  if (transactionSignature) checkSignature(transactionSignature, "transaction");
  if (transactionSignature === receiptSignature) {
    throw new InputError(
      "That is the receipt's own signature. Paste the signature of the transaction you signed after saving the receipt, or leave it empty.",
    );
  }

  const receipt = await readReceipt(receiptSignature);
  if ("status" in receipt) return receipt;
  if (!transactionSignature) {
    return { status: "verified", receipt, transaction: null };
  }

  const fetched = await fetchConfirmed(transactionSignature);
  if (!fetched) {
    return {
      status: "transaction-not-found",
      receipt,
      message:
        "Signed transaction not found on Devnet. It may still be confirming.",
    };
  }
  const { result, parts } = fetched;
  const messageHash = hashMessage(parts.messageBytes);

  return {
    status: "verified",
    receipt,
    transaction: {
      signature: transactionSignature,
      slot: result.slot,
      blockTime: result.blockTime,
      messageHash,
      succeeded: !result.meta?.err,
      sameMessage: messageHash === receipt.messageHash,
      sameWallet: parts.signers.includes(receipt.recorder),
      recordedFirst: receipt.slot <= result.slot,
    },
  };
}
