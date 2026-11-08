import {
  getBase64Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  getTransactionEncoder,
  type GetLatestBlockhashApi,
  type Rpc,
  type Transaction,
} from "@solana/kit";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const ADVANCE_NONCE = 4;

/**
 * Swap an unsigned transaction's blockhash for a new one. Everything else
 * (instructions, accounts, fee payer) stays the same, and any signatures are
 * cleared because they no longer match.
 *
 * Returns null for durable-nonce transactions, which do not expire and must
 * keep their nonce.
 */
export function withBlockhash(
  transactionBase64: string,
  blockhash: string,
): string | null {
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(transactionBase64),
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );

  const first = "instructions" in message ? message.instructions[0] : undefined;
  const usesNonce =
    first !== undefined &&
    message.staticAccounts[first.programAddressIndex] === SYSTEM_PROGRAM &&
    first.data?.[0] === ADVANCE_NONCE;
  if (usesNonce) return null;

  const messageBytes = getCompiledTransactionMessageEncoder().encode({
    ...message,
    lifetimeToken: blockhash,
  });
  const signatures = Object.fromEntries(
    Object.keys(transaction.signatures).map((signer) => [signer, null]),
  );
  const refreshed = {
    messageBytes,
    signatures,
  } as unknown as Transaction;
  return getBase64Decoder().decode(getTransactionEncoder().encode(refreshed));
}

/** Give a checked transaction a fresh blockhash so it can be signed again. */
export async function refreshBlockhash(
  transactionBase64: string,
  rpc: Rpc<GetLatestBlockhashApi>,
) {
  const { value } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  return withBlockhash(transactionBase64, value.blockhash);
}
