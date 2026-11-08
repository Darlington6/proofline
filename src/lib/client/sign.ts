import {
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  isTransactionModifyingSigner,
  isTransactionSendingSigner,
  signAndSendTransactionWithSigners,
  signTransactionWithSigners,
  type Base64EncodedWireTransaction,
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

/** The error's message plus its causes, e.g. "Transaction simulation failed: Blockhash not found". */
function describe(error: unknown) {
  const parts: string[] = [];
  let current: unknown = error;
  while (current && parts.length < 5) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(": ");
}

export function friendly(error: unknown) {
  const message = describe(error);
  if (/blockhash not found|block height exceeded|expired/i.test(message)) {
    return "This transaction expired before it was sent. Solana transactions stay valid for about a minute, so run the check again to get a fresh one.";
  }
  if (/reject|declin|cancel/i.test(message)) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  return message;
}

export type SignOutcome =
  /** The wallet returned a signed transaction for Proofline to send. */
  | { kind: "signed"; wire: Base64EncodedWireTransaction; changed: boolean }
  /** The wallet can only sign-and-send, so it already sent it. */
  | { kind: "sent"; signature: string };

/**
 * Ask the wallet to sign the transaction Proofline checked.
 *
 * Some wallets (Phantom, for example) add instructions such as a priority fee
 * while signing. The caller gets the signed bytes plus a `changed` flag, so it
 * can re-check the wallet's version before sending anything.
 */
export async function signChecked(
  transactionBase64: string,
  signer: TransactionSigner,
): Promise<SignOutcome> {
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(transactionBase64),
  );

  try {
    if (isTransactionModifyingSigner(signer)) {
      const signed = await signTransactionWithSigners([signer], transaction);
      return {
        kind: "signed",
        wire: getBase64EncodedWireTransaction(signed),
        changed: !sameBytes(signed.messageBytes, transaction.messageBytes),
      };
    }

    if (isTransactionSendingSigner(signer)) {
      const signature = await signAndSendTransactionWithSigners(
        [signer],
        transaction,
      );
      return { kind: "sent", signature: getBase58Decoder().decode(signature) };
    }
  } catch (error) {
    throw new Error(friendly(error));
  }

  throw new Error("This wallet cannot sign transactions.");
}

/** Send a transaction the wallet already signed. */
export async function sendSigned(
  wire: Base64EncodedWireTransaction,
  rpc: SigningRpc,
) {
  try {
    return await rpc
      .sendTransaction(wire, {
        encoding: "base64",
        preflightCommitment: "confirmed",
      })
      .send();
  } catch (error) {
    throw new Error(friendly(error));
  }
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
