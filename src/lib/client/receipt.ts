import {
  AccountRole,
  address,
  type Address,
  type GetLatestBlockhashApi,
  type Rpc,
} from "@solana/kit";
import { MEMO_PROGRAM } from "@/lib/analysis/programs";
import { formatReceiptMemo, type ReceiptMemo } from "@/lib/receipt";
import { compileForWallet, computeBudget } from "./scenarios";

/**
 * Build an unsigned transaction that records a Proofline receipt memo.
 * The wallet is listed on the memo, so the Memo Program requires its
 * signature: the receipt is provably from that wallet.
 */
export function buildReceipt(
  wallet: Address,
  memo: ReceiptMemo,
  rpc: Rpc<GetLatestBlockhashApi>,
) {
  return compileForWallet(
    [
      ...computeBudget(100_000), // the memo itself uses about 45,000
      {
        programAddress: address(MEMO_PROGRAM),
        accounts: [{ address: wallet, role: AccountRole.READONLY_SIGNER }],
        data: new TextEncoder().encode(formatReceiptMemo(memo)),
      },
    ],
    wallet,
    rpc,
  );
}
