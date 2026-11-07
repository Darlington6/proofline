import { describe, expect, it } from "vitest";
import { formatReceiptMemo, parseReceiptMemo, receiptPath } from "./receipt";

const HASH = "a".repeat(64);

describe("receipt memo", () => {
  it("round-trips", () => {
    const memo = formatReceiptMemo({ riskLevel: "medium", messageHash: HASH });
    expect(memo).toBe(`proofline:v1:medium:${HASH}`);
    expect(parseReceiptMemo(memo)).toEqual({
      riskLevel: "medium",
      messageHash: HASH,
    });
  });

  it("rejects anything that is not a v1 receipt", () => {
    expect(parseReceiptMemo("hello")).toBeNull();
    expect(parseReceiptMemo(`proofline:v1:extreme:${HASH}`)).toBeNull();
    expect(parseReceiptMemo("proofline:v1:low:abc")).toBeNull();
    expect(parseReceiptMemo(`proofline:v1:low:${HASH}:extra`)).toBeNull();
  });

  it("builds a shareable verification link", () => {
    expect(receiptPath("r", "t")).toBe("/receipts?receipt=r&tx=t");
  });
});
