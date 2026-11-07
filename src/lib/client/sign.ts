import {
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  isTransactionModifyingSigner,
  isTransactionSendingSigner,
  signAndSendTransactionWithSigners,
  signTransactionWithSigners,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
  type TransactionSigner,
} from "@solana/kit";

type SigningRpc = Rpc<SendTransactionApi & GetSignatureStatusesApi>;

const CONFIRM_TIMEOUT_MS = 60_000;

function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function friendly(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/blockhash not found|block height exceeded|expired/i.test(message)) {
    return "This transaction expired before it was sent. Run the check again to get a fresh one.";
  }
  if (/reject|declin|cancel/i.test(message)) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  return message;
}

/**
 * Sign and send exactly the transaction Proofline checked.
 *
 * When the wallet can return a signed transaction, Proofline compares its
 * message bytes with the checked bytes and refuses to send if the wallet
 * changed anything. Wallets that can only sign-and-send are used as a
 * fallback, and the confirmed result is reviewed afterwards.
 */
export async function signAndSendExact(
  transactionBase64: string,
  signer: TransactionSigner,
  rpc: SigningRpc,
): Promise<string> {
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(transactionBase64),
  );

  try {
    if (isTransactionModifyingSigner(signer)) {
      const signed = await signTransactionWithSigners([signer], transaction);
      if (!sameBytes(signed.messageBytes, transaction.messageBytes)) {
        throw new Error(
          "Your wallet changed the transaction after Proofline checked it, so it was not sent. Run the check again.",
        );
      }
      return await rpc
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: "base64",
          preflightCommitment: "confirmed",
        })
        .send();
    }

    if (isTransactionSendingSigner(signer)) {
      const signature = await signAndSendTransactionWithSigners(
        [signer],
        transaction,
      );
      return getBase58Decoder().decode(signature);
    }
  } catch (error) {
    throw new Error(friendly(error));
  }

  throw new Error("This wallet cannot sign transactions.");
}

export async function waitForConfirmation(rpc: SigningRpc, signature: string) {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { value } = await rpc
      .getSignatureStatuses([signature as never])
      .send();
    const status = value[0];
    if (status?.err) {
      throw new Error("The transaction failed on-chain.");
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(
    "Still waiting for confirmation. Check the Explorer link in a moment.",
  );
}
