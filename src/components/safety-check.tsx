"use client";

import { useState } from "react";
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
  SCENARIOS,
  buildScenario,
  type ScenarioKind,
} from "@/lib/client/scenarios";
import { signAndSendExact, waitForConfirmation } from "@/lib/client/sign";

type Phase =
  "idle" | "building" | "checking" | "signing" | "confirming" | "confirmed";

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [signature, setSignature] = useState("");
  const [confirmedReview, setConfirmedReview] = useState<Review | null>(null);

  const walletAddress = connected?.account.address ?? null;
  const scenarioWallet = walletAddress ?? DEMO_WALLET;
  const busy =
    phase === "building" ||
    phase === "checking" ||
    phase === "signing" ||
    phase === "confirming";

  function reset() {
    setResult(null);
    setCheckedPayload("");
    setError("");
    setAcknowledged(false);
    setSignature("");
    setConfirmedReview(null);
    setPhase("idle");
  }

  async function runCheck(transaction: string) {
    setPhase("checking");
    setError("");
    try {
      const response = await fetch("/api/transactions/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transaction,
          wallet: walletAddress ?? undefined,
        }),
      });
      const checked = await readJson<CheckResult>(response);
      setResult(checked);
      setCheckedPayload(transaction);
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

  async function approveAndSign() {
    if (!result || !connected?.signer || checkedPayload !== payload) return;
    setError("");
    setPhase("signing");
    let sent: string | null = null;
    try {
      sent = await signAndSendExact(
        checkedPayload,
        connected.signer,
        client.rpc,
      );
      setSignature(sent);
      setPhase("confirming");
      await waitForConfirmation(client.rpc, sent);
      setPhase("confirmed");
      setConfirmedReview(await fetchConfirmedReview(sent));
    } catch (signError) {
      setError(
        signError instanceof Error
          ? signError.message
          : "Wallet signing failed.",
      );
      // Once sent, keep the Explorer link visible even if confirmation stalls.
      setPhase(sent ? "confirmed" : "idle");
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
                      : "Approve and sign"}
                  </button>
                  {blockedReason ? (
                    <p className="simulation-note">{blockedReason}</p>
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
