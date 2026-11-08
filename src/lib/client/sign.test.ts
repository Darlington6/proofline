import { describe, expect, it } from "vitest";
import { friendly } from "./sign";

describe("friendly", () => {
  it("explains an expired transaction hidden inside a preflight error", () => {
    const error = new Error("Transaction simulation failed", {
      cause: new Error("Blockhash not found"),
    });
    expect(friendly(error)).toMatch(/expired before it was sent/);
  });

  it("explains a rejection in the wallet", () => {
    expect(friendly(new Error("User rejected the request"))).toMatch(
      /rejected the request/,
    );
  });

  it("keeps the full reason for other errors", () => {
    const error = new Error("Transaction simulation failed", {
      cause: new Error("Insufficient funds for fee"),
    });
    expect(friendly(error)).toBe(
      "Transaction simulation failed: Insufficient funds for fee",
    );
  });
});
