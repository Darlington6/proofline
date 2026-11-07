"use client";

import { useState } from "react";
import { AnalysisReport } from "@/components/analysis-report";
import type {
  Explanation,
  RiskLevel,
  TransactionAnalysis,
} from "@/lib/analysis/types";

type Review = {
  analysis: TransactionAnalysis;
  explanation: Explanation;
  riskLevel: RiskLevel;
};

export function TransactionReview() {
  const [signature, setSignature] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = signature.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError("");
    setReview(null);

    try {
      const response = await fetch(
        `/api/transactions/${encodeURIComponent(trimmed)}`,
      );
      const payload = (await response.json().catch(() => null)) as
        (Review & { error?: string }) | null;
      if (!response.ok || !payload?.analysis) {
        throw new Error(payload?.error ?? "Unable to load transaction.");
      }
      setReview(payload);
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
        <p className="eyebrow">After the fact</p>
        <h2 id="review-title">Review any Devnet transaction.</h2>
      </div>
      <div className="review-form-layout">
        <form className="signature-form glass-panel" onSubmit={handleSubmit}>
          <label htmlFor="transaction-signature">
            Devnet transaction signature
          </label>
          <p>
            Paste a confirmed signature. Proofline decodes every instruction,
            including calls made inside other programs, and shows what changed.
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
          {review ? (
            <AnalysisReport
              analysis={review.analysis}
              explanation={review.explanation}
              riskLevel={review.riskLevel}
              kicker="Confirmed transaction"
              title={
                review.analysis.status === "failed"
                  ? "Failed transaction"
                  : "Confirmed transaction"
              }
            />
          ) : (
            <div className="empty-analysis">
              <span className="analysis-mark" aria-hidden="true">
                +
              </span>
              <p>The analysis appears here after a Devnet lookup.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
