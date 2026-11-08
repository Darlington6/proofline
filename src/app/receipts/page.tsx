import type { Metadata } from "next";
import Link from "next/link";
import { verifyReceipt, type ReceiptVerification } from "@/lib/server/receipts";
import { headers } from "next/headers";
import { clientKey, lookupLimiter } from "@/lib/server/rate-limit";
import { InputError } from "@/lib/server/rpc";

export const metadata: Metadata = {
  title: "Verify a receipt | Proofline",
  description:
    "Check on Solana that a transaction was reviewed by Proofline before it was signed.",
};

type Check = { ok: boolean; label: string; detail: string };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

function when(blockTime: number | null) {
  return blockTime
    ? new Date(blockTime * 1000).toUTCString()
    : "time not available";
}

function explorer(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

async function load(
  receipt: string,
  tx?: string,
): Promise<ReceiptVerification | { status: "error"; message: string }> {
  const retryAfter = lookupLimiter.take(clientKey(await headers()));
  if (retryAfter) {
    return {
      status: "error",
      message: `Too many lookups. Try again in ${retryAfter} seconds.`,
    };
  }
  try {
    return await verifyReceipt(receipt, tx);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof InputError
          ? error.message
          : "Could not reach Solana Devnet. Try again in a moment.",
    };
  }
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="risk-list" aria-label="Verification checks">
      {checks.map((check) => (
        <li key={check.label}>
          <span
            className={`risk-dot risk-dot-${check.ok ? "clear" : "high"}`}
            aria-hidden="true"
          />
          <div>
            <strong>
              {check.label}
              <span className="visually-hidden">
                {check.ok ? " (passed)" : " (failed)"}
              </span>
            </strong>
            <small>{check.detail}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Result({ result }: { result: Awaited<ReturnType<typeof load>> }) {
  if (result.status !== "verified") {
    return (
      <>
        <p className="form-error" role="alert">
          {result.message}
        </p>
        {"receipt" in result ? (
          <p className="simulation-note">
            The receipt itself is valid: it records {result.receipt.riskLevel}{" "}
            risk for message {result.receipt.messageHash.slice(0, 16)}….
          </p>
        ) : null}
      </>
    );
  }

  const { receipt, transaction } = result;
  const checks: Check[] = [
    {
      ok: true,
      label: "Receipt is on Solana",
      detail: `Signed by ${receipt.recorder} in slot ${receipt.slot.toLocaleString()} (${when(receipt.blockTime)}).`,
    },
  ];
  if (transaction) {
    checks.push(
      {
        ok: transaction.sameMessage,
        label: "Same transaction",
        detail: transaction.sameMessage
          ? "The signed transaction hashes to the exact fingerprint in the receipt. Nothing changed after the check."
          : `The signed transaction hashes to ${transaction.messageHash.slice(0, 16)}…, not the receipt's fingerprint. It is not the transaction Proofline checked.`,
      },
      {
        ok: transaction.sameWallet,
        label: "Same wallet",
        detail: transaction.sameWallet
          ? "The wallet that saved the receipt also signed the transaction."
          : "The receipt was saved by a different wallet from the one that signed.",
      },
      {
        ok: transaction.recordedFirst,
        label: "Checked first",
        detail: transaction.recordedFirst
          ? `Receipt in slot ${receipt.slot.toLocaleString()}, transaction in slot ${transaction.slot.toLocaleString()}.`
          : `The receipt (slot ${receipt.slot.toLocaleString()}) was saved after the transaction (slot ${transaction.slot.toLocaleString()}), so it cannot prove the check came first.`,
      },
      {
        ok: transaction.succeeded,
        label: "Transaction succeeded",
        detail: transaction.succeeded
          ? "The signed transaction executed successfully."
          : "The signed transaction failed on-chain.",
      },
    );
  }
  const allPassed = checks.every((check) => check.ok);

  return (
    <div className="analysis-report">
      <div className="analysis-header">
        <div>
          <p className="panel-kicker">Proofline receipt</p>
          <h3>
            {!transaction
              ? "Receipt found"
              : allPassed
                ? "Verified"
                : "Does not match"}
          </h3>
        </div>
        <span className={`risk-badge risk-${receipt.riskLevel}`}>
          {receipt.riskLevel} risk
        </span>
      </div>
      <p className="analysis-summary">
        {!transaction
          ? `Proofline checked a transaction and found ${receipt.riskLevel} risk. Add the signed transaction's signature to prove it is the same one.`
          : allPassed
            ? `This transaction is exactly the one Proofline checked before it was signed, and the check found ${receipt.riskLevel} risk.`
            : "At least one check failed, so this receipt does not prove the transaction was checked first."}
      </p>
      <CheckList checks={checks} />
      <p className="fingerprint" title={receipt.messageHash}>
        Checked message fingerprint <code>{receipt.messageHash}</code>
      </p>
      <p className="receipt-links">
        <a href={explorer(receipt.signature)} target="_blank" rel="noreferrer">
          Receipt on Explorer ↗
        </a>
        {transaction ? (
          <a
            href={explorer(transaction.signature)}
            target="_blank"
            rel="noreferrer"
          >
            Transaction on Explorer ↗
          </a>
        ) : null}
      </p>
    </div>
  );
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const receipt = first(query.receipt);
  const tx = first(query.tx);
  const result = receipt ? await load(receipt, tx) : null;

  return (
    <main>
      <nav className="nav nav-simple shell" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="Proofline home">
          proof<span>line</span>
        </Link>
        <Link href="/#simulation">Run a safety check →</Link>
      </nav>

      <section
        className="transaction-review shell"
        aria-labelledby="receipt-title"
      >
        <div className="section-heading">
          <p className="eyebrow">Proof on Solana</p>
          <h1 id="receipt-title">Verify a Proofline receipt.</h1>
        </div>
        <div className="review-form-layout">
          <form className="signature-form glass-panel" method="get">
            <label htmlFor="receipt">Receipt signature</label>
            <p>
              A receipt is a memo your wallet signs after a check and before
              signing. It records the risk level and a fingerprint of the exact
              transaction Proofline simulated.
            </p>
            <div className="receipt-inputs">
              <input
                id="receipt"
                name="receipt"
                defaultValue={receipt}
                placeholder="Receipt signature"
                spellCheck={false}
                autoComplete="off"
                required
              />
              <label htmlFor="tx">Signed transaction (optional)</label>
              <input
                id="tx"
                name="tx"
                defaultValue={tx}
                placeholder="Signature of the transaction you signed"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="primary-button" type="submit">
                Verify on Devnet
              </button>
            </div>
          </form>

          <div className="analysis-panel glass-panel" aria-live="polite">
            {result ? (
              <Result result={result} />
            ) : (
              <div className="empty-analysis">
                <span className="analysis-mark" aria-hidden="true">
                  ~
                </span>
                <p>
                  Paste a receipt signature. Add the signed transaction to check
                  it is the same one Proofline reviewed.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
