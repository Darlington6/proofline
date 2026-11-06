"use client";

import { useState } from "react";
import type { TransactionAnalysis } from "@/lib/transaction-analysis";

export function TransactionReview() {
  const [signature, setSignature] = useState("");
  const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSignature = signature.trim();
    if (!trimmedSignature) return;

    setIsLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch(
        `/api/transactions/${encodeURIComponent(trimmedSignature)}`,
      );
      const payload = (await response.json()) as
        TransactionAnalysis | { error?: string };

      if (!response.ok) {
        const message = "error" in payload ? payload.error : undefined;
        throw new Error(message ?? "Unable to load transaction.");
      }

      if (!("signature" in payload)) {
        throw new Error(payload.error ?? "Unable to load transaction.");
      }

      setAnalysis(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load transaction.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      className="transaction-review shell"
      aria-labelledby="review-title"
    >
      <div className="section-heading">
        <p className="eyebrow">Start with a signature</p>
        <h2 id="review-title">Bring a transaction into focus.</h2>
      </div>
      <div className="review-form-layout">
        <form className="signature-form glass-panel" onSubmit={handleSubmit}>
          <label htmlFor="transaction-signature">
            Devnet transaction signature
          </label>
          <p>
            Paste a confirmed signature to inspect its instructions and fee.
          </p>
          <div className="signature-input-row">
            <input
              id="transaction-signature"
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
              placeholder="5Vf..."
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="primary-button"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Review"}
            </button>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <div className="analysis-panel glass-panel" aria-live="polite">
          {!analysis && !error ? (
            <div className="empty-analysis">
              <span className="analysis-mark" aria-hidden="true">
                +
              </span>
              <p>Analysis will appear here after a Devnet lookup.</p>
            </div>
          ) : null}
          {analysis ? (
            <>
              <div className="analysis-header">
                <div>
                  <p className="panel-kicker">Parsed result</p>
                  <h3>
                    {analysis.status === "confirmed"
                      ? "Confirmed transaction"
                      : "Failed transaction"}
                  </h3>
                </div>
                <span className={`risk-badge risk-${analysis.riskLevel}`}>
                  {analysis.riskLevel} risk
                </span>
              </div>
              <p className="analysis-summary">{analysis.riskSummary}</p>
              <div className="analysis-stats">
                <span>
                  Slot <strong>{analysis.slot}</strong>
                </span>
                <span>
                  Fee <strong>{analysis.feeSol.toFixed(6)} SOL</strong>
                </span>
              </div>
              <ul className="instruction-list">
                {analysis.instructions.map((instruction, index) => (
                  <li key={`${instruction.program}-${index}`}>
                    <span>{instruction.action}</span>
                    <small>
                      {instruction.program} · {instruction.detail}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="simulation-note">
                Simulation before signing is the next safety check.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
