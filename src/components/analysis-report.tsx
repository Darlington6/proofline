import type {
  Explanation,
  RiskLevel,
  TransactionAnalysis,
} from "@/lib/analysis/types";
import { shortAddress } from "@/lib/analysis/programs";

type Props = {
  analysis: TransactionAnalysis;
  explanation: Explanation;
  riskLevel: RiskLevel;
  kicker: string;
  title: string;
};

function formatDelta(lamports: number) {
  const sol = lamports / 1_000_000_000;
  return `${sol > 0 ? "+" : ""}${sol.toFixed(6)} SOL`;
}

function formatTokenDelta(
  before: string,
  after: string,
  decimals: number | null,
) {
  const delta = BigInt(after) - BigInt(before);
  const sign = delta > 0n ? "+" : delta < 0n ? "-" : "";
  const abs = delta < 0n ? -delta : delta;
  if (decimals == null) return `${sign}${abs.toString()} base units`;
  const divisor = 10n ** BigInt(decimals);
  const fraction = (abs % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${sign}${(abs / divisor).toString()}${fraction ? `.${fraction}` : ""} tokens`;
}

const FALLBACK_TEXT: Record<
  NonNullable<Explanation["fallbackReason"]>,
  string
> = {
  "missing-key":
    "No AI model is configured, so this explanation comes from the rules engine.",
  "provider-error":
    "The AI model could not be reached, so this explanation comes from the rules engine.",
  "invalid-response":
    "The AI model returned an unusable answer, so this explanation comes from the rules engine.",
  "rate-limited":
    "The AI explanation limit was reached for now, so this explanation comes from the rules engine.",
};

export function AnalysisReport({
  analysis,
  explanation,
  riskLevel,
  kicker,
  title,
}: Props) {
  const { balanceChanges, simulation } = analysis;
  const hasChanges =
    balanceChanges.sol.length + balanceChanges.tokens.length > 0;

  return (
    <div className="analysis-report">
      <div className="analysis-header">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h3>{title}</h3>
        </div>
        <span className={`risk-badge risk-${riskLevel}`}>{riskLevel} risk</span>
      </div>

      <div className="explanation-panel">
        <p className="panel-kicker">
          {explanation.provider === "model"
            ? "AI explanation"
            : "Rules-based explanation"}
          {explanation.confidence
            ? ` · ${explanation.confidence} confidence`
            : ""}
        </p>
        {explanation.fallbackReason ? (
          <p className="explanation-source">
            {FALLBACK_TEXT[explanation.fallbackReason]}
          </p>
        ) : null}
        {explanation.raisedRisk ? (
          <p className="explanation-source">
            The AI rated this riskier than the rules engine did, so Proofline
            uses the higher rating.
          </p>
        ) : null}
        <h3>{explanation.summary}</h3>
        <p className="analysis-summary">{explanation.recommendation}</p>
      </div>

      <ul className="risk-list" aria-label="Risk checks">
        {analysis.risks.map((risk) => (
          <li key={risk.key}>
            <span
              className={`risk-dot risk-dot-${risk.severity}`}
              aria-hidden="true"
            />
            <div>
              <strong>
                {risk.label}
                <span className="visually-hidden"> ({risk.severity})</span>
              </strong>
              <small>{risk.detail}</small>
            </div>
          </li>
        ))}
      </ul>

      <div className="analysis-stats">
        <span>
          Fee <strong>{analysis.feeSol.toFixed(6)} SOL</strong>
        </span>
        <span>
          Compute{" "}
          <strong>
            {simulation?.unitsConsumed?.toLocaleString("en-US") ?? "-"}
          </strong>
        </span>
        {analysis.slot !== null ? (
          <span>
            Slot <strong>{analysis.slot}</strong>
          </span>
        ) : null}
      </div>

      {hasChanges ? (
        <div className="report-section">
          <p className="panel-kicker">
            {analysis.status === "simulated"
              ? "What would change"
              : "What changed"}
          </p>
          <ul className="change-list">
            {balanceChanges.sol.map((change) => {
              const delta = change.lamportsAfter - change.lamportsBefore;
              return (
                <li key={`sol-${change.address}`}>
                  <span title={change.address}>{change.label}</span>
                  <strong className={delta < 0 ? "delta-out" : "delta-in"}>
                    {formatDelta(delta)}
                  </strong>
                </li>
              );
            })}
            {balanceChanges.tokens.map((change) => (
              <li key={`token-${change.account}`}>
                <span title={change.account}>
                  {change.owner === analysis.wallet
                    ? "Your"
                    : shortAddress(change.owner)}{" "}
                  token account {shortAddress(change.account)}
                  {change.delegateAfter &&
                  change.delegateAfter !== change.delegateBefore ? (
                    <em>
                      {" "}
                      · new delegate {shortAddress(change.delegateAfter)}
                    </em>
                  ) : null}
                </span>
                <strong
                  className={
                    BigInt(change.amountAfter) < BigInt(change.amountBefore)
                      ? "delta-out"
                      : "delta-in"
                  }
                >
                  {formatTokenDelta(
                    change.amountBefore,
                    change.amountAfter,
                    change.decimals,
                  )}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="report-section">
        <p className="panel-kicker">Instructions</p>
        <ul className="instruction-list">
          {analysis.instructions.map((ix, index) => (
            <li
              key={`${ix.programAddress}-${index}`}
              className={`instruction-${ix.level}${ix.inner ? " instruction-inner" : ""}`}
            >
              <span>
                {ix.inner ? "↳ " : ""}
                {ix.action}
              </span>
              <small>
                {ix.program}
                {ix.inner && ix.invokedBy
                  ? ` (called by ${ix.invokedBy})`
                  : ""}{" "}
                · {ix.detail}
              </small>
            </li>
          ))}
        </ul>
      </div>

      {simulation?.err ? (
        <pre className="simulation-error">
          {JSON.stringify(simulation.err, null, 2)}
        </pre>
      ) : null}
      {simulation && simulation.logs.length > 0 ? (
        <details className="log-details">
          <summary>Program logs ({simulation.logs.length})</summary>
          <pre className="simulation-logs">{simulation.logs.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}
