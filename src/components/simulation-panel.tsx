"use client";

import { useState } from "react";

type SimulationResult = {
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
};

export function SimulationPanel() {
  const [transaction, setTransaction] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setResult(null);

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
                <span
                  className={`risk-badge ${result.err ? "risk-high" : "risk-low"}`}
                >
                  {result.err ? "review" : "clear"}
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
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
