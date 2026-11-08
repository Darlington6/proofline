import { describe, expect, it } from "vitest";
import {
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SolanaError,
} from "@solana/kit";
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

  it("spots an expired transaction from the error code alone", () => {
    // What a production build throws: codes, no readable text.
    const cause = new SolanaError(
      SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
    );
    cause.message = "Solana error #7050008; Decode this error by running ...";
    const error = new SolanaError(
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
      { cause } as never,
    );
    error.message = "Solana error #-32002; Decode this error by running ...";
    expect(friendly(error)).toMatch(/expired before it was sent/);
  });
});
