import { maxRisk } from "@/lib/analysis/engine";
import type {
  Explanation,
  RiskLevel,
  TransactionAnalysis,
} from "@/lib/analysis/types";
import { modelClientLimiter, modelGlobalLimiter } from "./rate-limit";

const MODEL_TIMEOUT_MS = 15_000;
const MAX_FINDINGS = 8;
const MAX_TEXT = 600;

function findings(flagged: TransactionAnalysis["risks"]) {
  return flagged.length > 0
    ? flagged.map((r) => `${r.label}: ${r.detail}`)
    : ["The rules engine found nothing to flag."];
}

export function rulesExplanation(analysis: TransactionAnalysis): Explanation {
  const flagged = analysis.risks.filter((r) => r.severity !== "clear");
  const high = flagged.find((r) => r.severity === "high");
  const review = flagged.find((r) => r.severity === "review");
  const main = analysis.instructions.find(
    (ix) => !ix.inner && ix.program !== "Compute Budget Program",
  );
  const failed = analysis.risks.some(
    (r) => r.key === "failed-simulation" && r.severity === "high",
  );

  // A confirmed transaction already happened, so the advice is about
  // what to do next, not whether to sign.
  if (analysis.status !== "simulated") {
    return {
      provider: "rules",
      summary: failed
        ? "This transaction failed on-chain, so only the fee was charged."
        : high
          ? `High risk. ${high.detail}`
          : review
            ? `Worth a closer look. ${review.detail}`
            : main
              ? `This looked routine. ${main.detail}`
              : "This looked routine.",
      recommendation:
        analysis.riskLevel === "high"
          ? "If you did not expect this, act now: revoke the approval or move your funds to a wallet you control."
          : analysis.riskLevel === "medium"
            ? "Check that the destinations and amounts are what you intended."
            : "Nothing here needs action.",
      findings: findings(flagged),
    };
  }

  return {
    provider: "rules",
    summary: failed
      ? "The simulation failed, so this transaction would not do what it intends."
      : high
        ? `Do not sign yet. ${high.detail}`
        : review
          ? `Review before signing. ${review.detail}`
          : main
            ? `This looks routine. ${main.detail}`
            : "This looks routine.",
    recommendation:
      analysis.riskLevel === "high"
        ? "Reject this transaction unless you fully understand and expect every flagged item."
        : analysis.riskLevel === "medium"
          ? "Check each highlighted item, especially destinations and amounts, before signing."
          : "You can continue to wallet approval. Your wallet will still ask you to confirm.",
    findings: findings(flagged),
  };
}

/** The facts the model sees. Raw bytes stay out; decoded meaning goes in. */
function modelFacts(analysis: TransactionAnalysis) {
  return {
    status: analysis.status,
    feeSol: analysis.feeSol,
    wallet: analysis.wallet,
    signers: analysis.signers,
    instructions: analysis.instructions.map((ix) => ({
      program: ix.program,
      programAddress: ix.programAddress,
      recognised: ix.known,
      action: ix.action,
      detail: ix.detail,
      calledInsideAnotherProgram: ix.inner,
    })),
    balanceChanges: analysis.balanceChanges,
    simulationError: analysis.simulation?.err ?? null,
    lastLogs: analysis.simulation?.logs.slice(-15) ?? [],
    rulesEngine: {
      riskLevel: analysis.riskLevel,
      risks: analysis.risks.map(({ label, severity, detail }) => ({
        label,
        severity,
        detail,
      })),
    },
  };
}

const SYSTEM_PROMPT = `You are Proofline, a cautious Solana transaction safety reviewer for people who are new to crypto.
You receive decoded facts about one Devnet transaction: its instructions (including calls made inside other programs), simulated balance changes, simulation logs, and the verdict of a deterministic rules engine.
Explain only what the facts show. Use plain language and short sentences. Never say a transaction is guaranteed safe.
You may rate the risk higher than the rules engine if the facts justify it, for example an unrecognised program moving funds. Do not rate it lower.
Return a JSON object with exactly these fields:
- "summary": one or two sentences on what this transaction does and whether to sign it.
- "recommendation": one sentence telling the user what to do.
- "findings": an array of up to 6 short strings, each one concrete observation.
- "riskLevel": "low", "medium" or "high".
- "confidence": "low", "medium" or "high", your confidence in this reading of the facts.`;

const LEVELS = ["low", "medium", "high"] as const;

function clip(text: string) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text;
}

export function parseModelResponse(content: string) {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  const { summary, recommendation, findings, riskLevel, confidence } = parsed;

  if (
    typeof summary !== "string" ||
    typeof recommendation !== "string" ||
    !Array.isArray(findings) ||
    !findings.every((f) => typeof f === "string") ||
    !LEVELS.includes(riskLevel as RiskLevel)
  ) {
    throw new Error("The explanation model returned an invalid shape.");
  }

  return {
    summary: clip(summary),
    recommendation: clip(recommendation),
    findings: (findings as string[]).slice(0, MAX_FINDINGS).map(clip),
    riskLevel: riskLevel as RiskLevel,
    confidence: LEVELS.includes(confidence as RiskLevel)
      ? (confidence as Explanation["confidence"])
      : undefined,
  };
}

/** Rules always run. The model, when configured, can only raise the risk. */
export async function explain(
  analysis: TransactionAnalysis,
  /** Client identifier for the AI budget. Omit to skip the budget check. */
  client?: string,
): Promise<{ explanation: Explanation; riskLevel: RiskLevel }> {
  const fallback = rulesExplanation(analysis);
  const rulesRisk = analysis.riskLevel;
  // `||` (not `??`) so an empty AI_API_KEY= line does not hide OPENAI_API_KEY.
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      explanation: { ...fallback, fallbackReason: "missing-key" },
      riskLevel: rulesRisk,
    };
  }

  // The safety check never waits on the AI budget: over the limit, the
  // rules engine answers instead.
  if (
    client !== undefined &&
    (modelClientLimiter.take(client) > 0 || modelGlobalLimiter.take("all") > 0)
  ) {
    return {
      explanation: { ...fallback, fallbackReason: "rate-limited" },
      riskLevel: rulesRisk,
    };
  }

  const model =
    process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";

  let content: string | undefined;
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(modelFacts(analysis)) },
          ],
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.warn(`Explanation provider returned HTTP ${response.status}`);
      return {
        explanation: { ...fallback, fallbackReason: "provider-error" },
        riskLevel: rulesRisk,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = payload.choices?.[0]?.message?.content;
  } catch (error) {
    console.warn("Explanation provider request failed", error);
    return {
      explanation: { ...fallback, fallbackReason: "provider-error" },
      riskLevel: rulesRisk,
    };
  }

  try {
    if (!content) throw new Error("empty response");
    const parsed = parseModelResponse(content);
    const riskLevel = maxRisk(rulesRisk, parsed.riskLevel);
    return {
      explanation: {
        provider: "model",
        summary: parsed.summary,
        recommendation: parsed.recommendation,
        findings: parsed.findings,
        confidence: parsed.confidence,
        raisedRisk: riskLevel !== rulesRisk,
      },
      riskLevel,
    };
  } catch {
    return {
      explanation: { ...fallback, fallbackReason: "invalid-response" },
      riskLevel: rulesRisk,
    };
  }
}
