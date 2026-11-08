"use client";

import { useRef, useState } from "react";
import { address, isAddress } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { client } from "@/app/providers";
import { AnalysisReport } from "@/components/analysis-report";
import { useHydrated } from "@/hooks/use-hydrated";
import type {
  CheckResult,
  Explanation,
  RiskLevel,
  TransactionAnalysis,
} from "@/lib/analysis/types";
import {
  compareWalletVersion,
  type WalletChange,
} from "@/lib/analysis/compare";
import { buildReceipt } from "@/lib/client/receipt";
import { refreshBlockhash } from "@/lib/client/refresh";
import { receiptPath } from "@/lib/receipt";
import {
  SCENARIOS,
  buildScenario,
  type ScenarioKind,
} from "@/lib/client/scenarios";
import {
  sendSigned,
  signChecked,
  waitForConfirmation,
} from "@/lib/client/sign";

type Phase =
  | "idle"
  | "building"
  | "checking"
  | "signing"
  | "rechecking"
  | "refreshing"
  | "confirming"
  | "confirmed";

type Review = {
  analysis: TransactionAnalysis;
  explanation: Explanation;
  riskLevel: RiskLevel;
};

// Optional funded Devnet address used as fee payer for review-only scenarios
// when no wallet is connected. Simulation skips signature checks, so only the
// public address is needed.
const demoWallet = process.env.NEXT_PUBLIC_DEMO_WALLET;
const DEMO_WALLET = demoWallet && isAddress(demoWallet) ? demoWallet : null;

// A blockhash lasts about a minute. Past this age, Proofline gives the
// transaction a fresh one and checks it again before asking the wallet.
const FRESH_FOR_MS = 30_000;

const timestamp = () => Date.now();

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ?? `Request failed with HTTP ${response.status}.`,
    );
  }
  return payload;
}

async function checkOnDevnet(transaction: string, wallet: string | null) {
  const response = await fetch("/api/transactions/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction, wallet: wallet ?? undefined }),
  });
  return readJson<CheckResult>(response);
}

async function fetchConfirmedReview(signature: string): Promise<Review | null> {
  // The RPC can take a few seconds to index a newly confirmed transaction.
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`/api/transactions/${signature}`);
    if (response.ok) return (await response.json()) as Review;
    if (response.status !== 404) return null;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

export function SafetyCheck() {
  const isHydrated = useHydrated();
  const connected = useConnectedWallet(client);

  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedPayload, setCheckedPayload] = useState("");
  // When the current check ran, used to decide if it needs a fresh blockhash.
  const checkedAt = useRef(0);
  const [refreshNote, setRefreshNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [signature, setSignature] = useState("");
  const [confirmedReview, setConfirmedReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [walletChange, setWalletChange] = useState<
    (WalletChange & { messageHash: string; riskLevel: RiskLevel }) | null
  >(null);

  const walletAddress = connected?.account.address ?? null;
  const scenarioWallet = walletAddress ?? DEMO_WALLET;
  const busy =
    phase === "building" ||
    phase === "checking" ||
    phase === "signing" ||
    phase === "rechecking" ||
    phase === "refreshing" ||
    phase === "confirming" ||
    receiptBusy;

  function reset() {
    setResult(null);
    setCheckedPayload("");
    setError("");
    setAcknowledged(false);
    setSignature("");
    setConfirmedReview(null);
    setWalletChange(null);
    setReceipt("");
    setReceiptError("");
    setRefreshNote("");
    setPhase("idle");
  }

  async function runCheck(transaction: string) {
    setPhase("checking");
    setError("");
    try {
      const checked = await checkOnDevnet(transaction, walletAddress);
      setResult(checked);
      setCheckedPayload(transaction);
      checkedAt.current = timestamp();
      setPhase("idle");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to check this transaction.",
      );
      setPhase("idle");
    }
  }

  async function runScenario(kind: ScenarioKind) {
    if (!scenarioWallet) return;
    reset();
    setPhase("building");
    try {
      const transaction = await buildScenario(
        kind,
        address(scenarioWallet),
        client.rpc,
      );
      setPayload(transaction);
      await runCheck(transaction);
    } catch (buildError) {
      setError(
        buildError instanceof Error
          ? buildError.message
          : "Unable to build the scenario.",
      );
      setPhase("idle");
    }
  }

  /**
   * Return the checked transaction, re-checked with a fresh blockhash if the
   * check is too old to sign. The user can read for as long as they like; the
   * clock only matters once they act. The new version must be no riskier.
   */
  async function freshCheck(current: CheckResult, force = false) {
    if (!force && timestamp() - checkedAt.current < FRESH_FOR_MS) {
      return { checked: current, transaction: checkedPayload };
    }
    const transaction = await refreshBlockhash(checkedPayload, client.rpc);
    if (!transaction) return { checked: current, transaction: checkedPayload };

    const checked = await checkOnDevnet(transaction, walletAddress);
    setResult(checked);
    setPayload(transaction);
    setCheckedPayload(transaction);
    checkedAt.current = timestamp();
    setReceipt("");
    if (
      checked.analysis.simulation?.err ||
      RANK[checked.riskLevel] > RANK[current.riskLevel]
    ) {
      setAcknowledged(false);
      throw new Error(
        "Proofline checked the transaction again with a fresh blockhash and the result changed. Review the new result before signing.",
      );
    }
    setRefreshNote(
      "Checked again with a fresh blockhash just now. Same result, so you can continue.",
    );
    return { checked, transaction };
  }

  async function approveAndSign() {
    if (!result || !connected?.signer || checkedPayload !== payload) return;
    setError("");
    setWalletChange(null);
    let sent: string | null = null;
    try {
      // With a receipt saved, signing must use the exact transaction it
      // records, so it is never refreshed here.
      let current = { checked: result, transaction: checkedPayload };
      if (!receipt) {
        setPhase("refreshing");
        current = await freshCheck(result);
      }
      setPhase("signing");
      const outcome = await signChecked(current.transaction, connected.signer);
      if (outcome.kind === "sent") {
        sent = outcome.signature;
      } else {
        if (outcome.changed) {
          // The wallet edited the transaction while signing (often to add a
          // priority fee). Check its version before sending anything.
          setPhase("rechecking");
          const signed = await checkOnDevnet(outcome.wire, walletAddress);
          const change = compareWalletVersion(current.checked, signed);
          setWalletChange({
            ...change,
            messageHash: signed.messageHash,
            riskLevel: signed.riskLevel,
          });
          if (change.blockedReason) throw new Error(change.blockedReason);
        }
        sent = await sendSigned(outcome.wire, client.rpc);
      }
      setRefreshNote("");
      setSignature(sent);
      setPhase("confirming");
      await waitForConfirmation(client.rpc, sent);
      setPhase("confirmed");
      setConfirmedReview(await fetchConfirmedReview(sent));
    } catch (signError) {
      const message =
        signError instanceof Error
          ? signError.message
          : "Wallet signing failed.";
      if (!sent && /expired before it was sent/.test(message)) {
        // The receipt's transaction expired before signing. Refresh it so the
        // user can sign again; the old receipt no longer matches.
        try {
          await freshCheck(result, true);
          setError(
            "The transaction expired before it was sent, so Proofline checked a fresh copy. Save a new receipt if you want one, then sign again.",
          );
        } catch (refreshError) {
          setError(
            refreshError instanceof Error ? refreshError.message : message,
          );
        }
        setPhase("idle");
        return;
      }
      setError(message);
      // Once sent, keep the Explorer link visible even if confirmation stalls.
      setPhase(sent ? "confirmed" : "idle");
    }
  }

  async function saveReceipt() {
    if (!result || !connected?.signer || !walletAddress) return;
    setReceiptError("");
    setReceiptBusy(true);
    try {
      const { checked } = await freshCheck(result);
      const transaction = await buildReceipt(
        address(walletAddress),
        { riskLevel: checked.riskLevel, messageHash: checked.messageHash },
        client.rpc,
      );
      const outcome = await signChecked(transaction, connected.signer);
      let sent: string;
      if (outcome.kind === "sent") {
        sent = outcome.signature;
      } else {
        if (outcome.changed) {
          throw new Error(
            "Your wallet changed the receipt transaction, so it was not sent.",
          );
        }
        sent = await sendSigned(outcome.wire, client.rpc);
      }
      await waitForConfirmation(client.rpc, sent);
      setReceipt(sent);
    } catch (receiptFailure) {
      setReceiptError(
        receiptFailure instanceof Error
          ? receiptFailure.message
          : "Unable to save the receipt.",
      );
    } finally {
      setReceiptBusy(false);
    }
  }

  const simulationFailed = Boolean(result?.analysis.simulation?.err);
  const blockedReason = !result
    ? null
    : result.riskLevel === "high"
      ? "Signing is blocked because this transaction is high risk."
      : simulationFailed
        ? "Signing is blocked because the simulation failed."
        : !connected
          ? "Connect a Devnet wallet to sign."
          : !connected.signer
            ? "This wallet is read-only and cannot sign."
            : !connected.supportedTransactionVersions.has(0)
              ? "This wallet does not support version 0 transactions."
              : !result.signableByWallet
                ? "This transaction needs signatures from accounts other than your wallet, so Proofline will only review it."
                : result.riskLevel === "medium" && !acknowledged
                  ? "Tick the box above to confirm you reviewed the warnings."
                  : null;
  const canSign =
    Boolean(result) && blockedReason === null && phase === "idle" && !signature;

  return (
    <section
      className="simulation-section shell"
      aria-labelledby="simulation-title"
    >
      <div className="section-heading">
        <p className="eyebrow">Before approval</p>
        <h2 id="simulation-title">Run the safety check.</h2>
      </div>
      <div className="simulation-layout">
        <div className="signature-form glass-panel">
          <div className="scenario-group">
            <span className="field-label">Try a real Devnet scenario</span>
            <p>
              Each scenario builds a real transaction, simulates it on Devnet,
              and analyses the result. Nothing is signed unless you approve.
            </p>
            {Object.entries(SCENARIOS).map(([kind, scenario]) => (
              <button
                key={kind}
                type="button"
                className="scenario-button"
                onClick={() => runScenario(kind as ScenarioKind)}
                disabled={!isHydrated || !scenarioWallet || busy}
              >
                <span className={`risk-badge risk-${scenario.expected}`}>
                  {scenario.expected}
                </span>
                <span className="scenario-text">
                  <strong>{scenario.label}</strong>
                  <small>{scenario.description}</small>
                </span>
              </button>
            ))}
            {isHydrated && !scenarioWallet ? (
              <p className="simulation-note">
                Connect a Devnet wallet to run scenarios.
              </p>
            ) : null}
            {isHydrated && !walletAddress && DEMO_WALLET ? (
              <p className="simulation-note">
                No wallet connected: scenarios use a demo Devnet address and are
                review-only.
              </p>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (payload.trim()) runCheck(payload.trim());
            }}
          >
            <label htmlFor="unsigned-transaction">
              Or paste any unsigned transaction
            </label>
            <textarea
              id="unsigned-transaction"
              value={payload}
              onChange={(event) => {
                setPayload(event.target.value);
                reset();
              }}
              placeholder="Base64 transaction payload..."
              spellCheck={false}
              rows={4}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !payload.trim()}
            >
              {phase === "checking"
                ? "Checking..."
                : phase === "building"
                  ? "Building..."
                  : "Check on Devnet"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div
          className="analysis-panel glass-panel"
          aria-live="polite"
          aria-busy={busy}
        >
          {!result ? (
            <div className="empty-analysis">
              <span className="analysis-mark" aria-hidden="true">
                ~
              </span>
              <p>
                {phase === "building" || phase === "checking"
                  ? "Simulating on Devnet and analysing..."
                  : "Pick a scenario or paste a transaction. The safety report appears here."}
              </p>
            </div>
          ) : (
            <>
              <AnalysisReport
                analysis={result.analysis}
                explanation={result.explanation}
                riskLevel={result.riskLevel}
                kicker="Devnet simulation"
                title={
                  simulationFailed ? "Simulation failed" : "Simulation passed"
                }
              />
              <p className="fingerprint" title={result.messageHash}>
                Checked message fingerprint{" "}
                <code>{result.messageHash.slice(0, 16)}…</code>
              </p>

              <div className="receipt-box">
                <strong>Proof receipt</strong>
                {receipt ? (
                  <>
                    <p>
                      Saved on Devnet. Anyone can verify that this exact
                      transaction was checked
                      {signature ? " before it was signed" : ""} and what
                      Proofline found.
                    </p>
                    <a
                      href={receiptPath(receipt, signature || undefined)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {signature
                        ? "Verify the signed transaction against this receipt ↗"
                        : "View receipt ↗"}
                    </a>
                  </>
                ) : signature ? (
                  <p>
                    This transaction is already signed, so a receipt saved now
                    could not prove the check came first. Save the receipt
                    before signing next time.
                  </p>
                ) : (
                  <>
                    <p>
                      Record this check on Solana: your wallet signs a memo with
                      the fingerprint and the {result.riskLevel} risk result
                      (about 0.000005 SOL).
                      {result.signableByWallet && !signature
                        ? " Save it before signing to prove the check came first."
                        : ""}
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={saveReceipt}
                      disabled={!connected?.signer || busy}
                    >
                      {receiptBusy ? "Saving receipt..." : "Save proof receipt"}
                    </button>
                    {!connected?.signer ? (
                      <p className="simulation-note">
                        Connect a Devnet wallet to save a receipt.
                      </p>
                    ) : null}
                  </>
                )}
                {receiptError ? (
                  <p className="form-error" role="alert">
                    {receiptError}
                  </p>
                ) : null}
              </div>

              {walletChange ? (
                <div className="wallet-change">
                  <strong>
                    Your wallet changed this transaction while signing.
                  </strong>
                  <p>
                    Proofline checked the wallet&apos;s version on Devnet:{" "}
                    <span
                      className={`risk-badge risk-${walletChange.riskLevel}`}
                    >
                      {walletChange.riskLevel}
                    </span>{" "}
                    risk
                    {walletChange.extraCostLamports > 0
                      ? `, ${(walletChange.extraCostLamports / 1e9).toFixed(6)} SOL extra cost`
                      : ""}
                    .
                  </p>
                  {walletChange.added.length ? (
                    <p>Added: {walletChange.added.join(", ")}</p>
                  ) : null}
                  {walletChange.removed.length ? (
                    <p>Removed: {walletChange.removed.join(", ")}</p>
                  ) : null}
                  <p className="fingerprint" title={walletChange.messageHash}>
                    Signed message fingerprint{" "}
                    <code>{walletChange.messageHash.slice(0, 16)}…</code>
                  </p>
                </div>
              ) : null}

              {!signature ? (
                <div className="approval-box">
                  {result.riskLevel === "medium" &&
                  !simulationFailed &&
                  result.signableByWallet ? (
                    <label className="acknowledge">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(event) =>
                          setAcknowledged(event.target.checked)
                        }
                      />
                      I reviewed the warnings and still want to sign.
                    </label>
                  ) : null}
                  <button
                    className="approve-button"
                    type="button"
                    onClick={approveAndSign}
                    disabled={!canSign}
                  >
                    {phase === "signing"
                      ? "Waiting for wallet..."
                      : phase === "refreshing"
                        ? "Checking a fresh copy..."
                        : phase === "rechecking"
                          ? "Checking your wallet's version..."
                          : "Approve and sign"}
                  </button>
                  {blockedReason ? (
                    <p className="simulation-note">{blockedReason}</p>
                  ) : refreshNote ? (
                    <p className="simulation-note">{refreshNote}</p>
                  ) : null}
                </div>
              ) : (
                <div className="sent-result">
                  <strong>
                    {phase === "confirming"
                      ? "Sent. Waiting for Devnet confirmation..."
                      : phase === "confirmed"
                        ? "Confirmed on Devnet."
                        : "Sent."}
                  </strong>
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Solana Explorer ↗
                  </a>
                </div>
              )}
            </>
          )}

          {confirmedReview ? (
            <div className="confirmed-review">
              <AnalysisReport
                analysis={confirmedReview.analysis}
                explanation={confirmedReview.explanation}
                riskLevel={confirmedReview.riskLevel}
                kicker="After signing"
                title="What actually happened"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
