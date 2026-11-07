"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  sol,
  solToLamports,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { useSendTransaction } from "@solana/react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { client } from "@/app/providers";
import {
  createPreparedTransferAnalysis,
  createRiskFixtureAnalysis,
  type RiskFixture,
  type TransactionAnalysis,
} from "@/lib/transaction-analysis";

const hydrationEvent = "proofline-simulation-hydrated";
let hasHydrated = false;

function subscribeToHydration(callback: () => void) {
  window.addEventListener(hydrationEvent, callback);
  return () => window.removeEventListener(hydrationEvent, callback);
}

function getHydrationSnapshot() {
  return hasHydrated;
}

function getServerHydrationSnapshot() {
  return false;
}

type SimulationResult = {
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
};

type Explanation = {
  provider: "rules" | "model";
  fallbackReason?: "missing-key" | "provider-error" | "invalid-response";
  summary: string;
  recommendation: string;
  findings: string[];
};

export function SimulationPanel() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [transaction, setTransaction] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explanationError, setExplanationError] = useState("");
  const [preparedAnalysis, setPreparedAnalysis] =
    useState<TransactionAnalysis | null>(null);

  const connected = useConnectedWallet(client);
  const {
    dispatch: sendTransfer,
    isRunning: isSending,
    data: sentData,
    error: sendError,
  } = useSendTransaction(client);
  const canSendV1 = connected?.supportedTransactionVersions.has(1) ?? false;

  useEffect(() => {
    hasHydrated = true;
    window.dispatchEvent(new Event(hydrationEvent));
  }, []);

  async function prepareTransfer() {
    if (!connected) return;

    setIsPreparing(true);
    setError("");
    setResult(null);
    setExplanation(null);
    setExplanationError("");

    try {
      const walletAddress = address(connected.account.address);
      setPreparedAnalysis(
        createPreparedTransferAnalysis(connected.account.address),
      );
      const { value: latestBlockhash } = await client.rpc
        .getLatestBlockhash({ commitment: "confirmed" })
        .send();
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (transaction) =>
          setTransactionMessageFeePayer(walletAddress, transaction),
        (transaction) =>
          setTransactionMessageLifetimeUsingBlockhash(
            latestBlockhash,
            transaction,
          ),
        (transaction) =>
          appendTransactionMessageInstruction(
            getTransferSolInstruction({
              source: createNoopSigner(walletAddress),
              destination: walletAddress,
              amount: solToLamports(sol("0.001")),
            }),
            transaction,
          ),
      );

      setTransaction(
        getBase64EncodedWireTransaction(compileTransaction(message)),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to prepare transaction.",
      );
    } finally {
      setIsPreparing(false);
    }
  }

  async function explainResult(
    analysis: TransactionAnalysis,
    simulation: SimulationResult,
  ) {
    setIsExplaining(true);
    setExplanationError("");

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis, simulation }),
      });
      const payload = (await response.json()) as
        Explanation | { error?: string };

      if (!response.ok) {
        const message = "error" in payload ? payload.error : undefined;
        throw new Error(message ?? "Unable to explain transaction.");
      }

      if (!("provider" in payload)) {
        throw new Error(payload.error ?? "Unable to explain transaction.");
      }

      setExplanation(payload);
    } catch (requestError) {
      setExplanationError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to explain transaction.",
      );
    } finally {
      setIsExplaining(false);
    }
  }

  async function loadRiskFixture(fixture: RiskFixture) {
    const analysis = createRiskFixtureAnalysis(fixture);
    const simulation = {
      err: null,
      logs: ["Fixture simulation: no network request made."],
      unitsConsumed: 150,
    };

    setTransaction("");
    setPreparedAnalysis(analysis);
    setResult(simulation);
    setError("");
    setExplanation(null);
    await explainResult(analysis, simulation);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setResult(null);
    setExplanation(null);
    setExplanationError("");

    try {
      const response = await fetch("/api/transactions/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transaction: transaction.trim() }),
      });
      const payload = (await response.json()) as
        SimulationResult | { error?: string };

      if (!response.ok) {
        const message = "error" in payload ? payload.error : undefined;
        throw new Error(message ?? "Unable to simulate transaction.");
      }

      if (!("unitsConsumed" in payload)) {
        throw new Error(payload.error ?? "Unable to simulate transaction.");
      }

      setResult(payload);
      if (preparedAnalysis) {
        await explainResult(preparedAnalysis, payload);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to simulate transaction.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function approveAndSign() {
    if (
      !connected ||
      !preparedAnalysis ||
      preparedAnalysis.signature !== "unsigned-devnet-transfer" ||
      !result ||
      result.err ||
      !explanation
    ) {
      return;
    }

    sendTransfer([
      getTransferSolInstruction({
        source: client.payer,
        destination: address(connected.account.address),
        amount: solToLamports(sol("0.001")),
      }),
    ]);
  }

  const sentSignature = sentData?.context.signature;
  const resultRisk = result?.err
    ? "high"
    : (preparedAnalysis?.riskLevel ?? "low");
  const canApprovePreparedTransfer =
    preparedAnalysis?.signature === "unsigned-devnet-transfer";

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
        <form className="signature-form glass-panel" onSubmit={handleSubmit}>
          <label htmlFor="unsigned-transaction">
            Unsigned transaction payload
          </label>
          <p>
            Paste a base64-encoded unsigned transaction. Proofline sends it to
            Devnet with signature verification disabled.
          </p>
          <textarea
            id="unsigned-transaction"
            value={transaction}
            onChange={(event) => setTransaction(event.target.value)}
            placeholder="Base64 transaction payload..."
            spellCheck={false}
            rows={5}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={prepareTransfer}
            disabled={!isHydrated || !connected || isPreparing}
          >
            {!isHydrated
              ? "Looking for wallet..."
              : isPreparing
                ? "Preparing..."
                : connected
                  ? "Prepare 0.001 SOL self-transfer"
                  : "Connect wallet to prepare a transfer"}
          </button>
          {process.env.NODE_ENV !== "production" ? (
            <div className="risk-lab">
              <span>Risk Lab</span>
              <button
                type="button"
                onClick={() => loadRiskFixture("medium-unknown-program")}
              >
                Medium: Unknown program
              </button>
              <button
                type="button"
                onClick={() => loadRiskFixture("high-token-approval")}
              >
                High: Token approval
              </button>
            </div>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={isLoading || !transaction.trim()}
          >
            {isLoading ? "Simulating..." : "Simulate on Devnet"}
            <span aria-hidden="true">↗</span>
          </button>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        <div className="analysis-panel glass-panel" aria-live="polite">
          {!result && !error ? (
            <div className="empty-analysis">
              <span className="analysis-mark" aria-hidden="true">
                ~
              </span>
              <p>
                Simulation results will show errors, logs, and compute usage
                here.
              </p>
            </div>
          ) : null}
          {result ? (
            <div className="simulation-result">
              <div className="analysis-header">
                <div>
                  <p className="panel-kicker">Devnet response</p>
                  <h3>
                    {result.err
                      ? "Simulation found an error"
                      : "Simulation passed"}
                  </h3>
                </div>
                <span className={`risk-badge risk-${resultRisk}`}>
                  {resultRisk} risk
                </span>
              </div>
              <div className="analysis-stats">
                <span>
                  Compute units <strong>{result.unitsConsumed ?? "-"}</strong>
                </span>
                <span>
                  Logs <strong>{result.logs.length}</strong>
                </span>
              </div>
              {result.err ? (
                <pre className="simulation-error">
                  {JSON.stringify(result.err, null, 2)}
                </pre>
              ) : null}
              {result.logs.length > 0 ? (
                <pre className="simulation-logs">{result.logs.join("\n")}</pre>
              ) : null}
              {preparedAnalysis ? (
                <ul className="risk-list">
                  {preparedAnalysis.risks.map((risk) => (
                    <li key={risk.key}>
                      <span className={`risk-dot risk-dot-${risk.severity}`} />
                      <div>
                        <strong>{risk.label}</strong>
                        <small>{risk.detail}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {isExplaining ? (
            <p className="simulation-note">
              Preparing transaction explanation...
            </p>
          ) : null}
          {explanation ? (
            <div className="explanation-panel">
              <p className="panel-kicker">
                {explanation.provider === "model"
                  ? "AI explanation"
                  : "Rules-based explanation"}
              </p>
              {explanation.fallbackReason ? (
                <p className="explanation-source">
                  {explanation.fallbackReason === "missing-key"
                    ? "No model key was detected."
                    : explanation.fallbackReason === "provider-error"
                      ? "The model provider request failed."
                      : "The model response was invalid."}{" "}
                  Showing the deterministic fallback.
                </p>
              ) : null}
              <h3>{explanation.summary}</h3>
              <p className="analysis-summary">{explanation.recommendation}</p>
              <ul className="finding-list">
                {explanation.findings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
              {!sentSignature ? (
                <>
                  <button
                    className="approve-button"
                    type="button"
                    onClick={approveAndSign}
                    disabled={
                      !connected ||
                      !canSendV1 ||
                      isSending ||
                      Boolean(result?.err) ||
                      preparedAnalysis?.riskLevel === "high" ||
                      !canApprovePreparedTransfer
                    }
                  >
                    {isSending ? "Waiting for wallet..." : "Approve and sign"}
                  </button>
                  {!canApprovePreparedTransfer ? (
                    <p className="simulation-note">
                      Risk Lab fixtures are review-only and cannot sign.
                    </p>
                  ) : null}
                  {!canSendV1 && connected ? (
                    <p className="form-error">
                      This wallet does not support the transaction version
                      required by this client.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="sent-result">
                  <strong>Confirmed on Devnet.</strong>
                  <a
                    href={`https://explorer.solana.com/tx/${sentSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                </div>
              )}
              {sendError ? (
                <p className="form-error" role="alert">
                  {sendError instanceof Error
                    ? sendError.message
                    : "Wallet signing failed."}
                </p>
              ) : null}
              {explanationError ? (
                <p className="form-error" role="alert">
                  {explanationError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
