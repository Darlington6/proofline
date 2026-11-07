import type { RiskLevel } from "@/lib/analysis/types";

/**
 * A Proofline receipt is a Memo Program note signed by the wallet:
 *
 *   proofline:v1:<risk level>:<sha256 of the checked message, hex>
 *
 * The hash commits to the exact transaction message Proofline simulated, so
 * anyone can later hash a signed transaction and compare.
 */
export const RECEIPT_PREFIX = "proofline:v1:";

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

export type ReceiptMemo = { riskLevel: RiskLevel; messageHash: string };

export function formatReceiptMemo({ riskLevel, messageHash }: ReceiptMemo) {
  return `${RECEIPT_PREFIX}${riskLevel}:${messageHash}`;
}

export function parseReceiptMemo(text: string): ReceiptMemo | null {
  if (!text.startsWith(RECEIPT_PREFIX)) return null;
  const [riskLevel, messageHash, ...rest] = text
    .slice(RECEIPT_PREFIX.length)
    .split(":");
  if (rest.length > 0) return null;
  if (!RISK_LEVELS.includes(riskLevel as RiskLevel)) return null;
  if (!/^[0-9a-f]{64}$/.test(messageHash ?? "")) return null;
  return { riskLevel: riskLevel as RiskLevel, messageHash };
}

/** Link to the public verification page. */
export function receiptPath(receipt: string, transaction?: string) {
  const query = new URLSearchParams({ receipt });
  if (transaction) query.set("tx", transaction);
  return `/receipts?${query}`;
}
