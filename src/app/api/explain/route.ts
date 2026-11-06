import { NextResponse } from "next/server";
import type { TransactionAnalysis } from "@/lib/transaction-analysis";

type SimulationSummary = {
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
};

type Explanation = {
  provider: "rules" | "openai";
  summary: string;
  recommendation: string;
  findings: string[];
};

function rulesExplanation(
  analysis: TransactionAnalysis,
  simulation?: SimulationSummary,
): Explanation {
  const findings = analysis.risks
    .filter((risk) => risk.severity !== "clear")
    .map((risk) => `${risk.label}: ${risk.detail}`);
  const simulationFailed = simulation?.err != null;

  return {
    provider: "rules",
    summary: simulationFailed
      ? "The Devnet simulation found an error, so this transaction should not be approved."
      : analysis.riskLevel === "low"
        ? "This looks like a low-risk system transfer, and Devnet simulation passed."
        : analysis.riskSummary,
    recommendation:
      simulationFailed || analysis.riskLevel === "high"
        ? "Reject this transaction and investigate the cause before trying again."
        : analysis.riskLevel === "medium"
          ? "Review every highlighted instruction and destination before signing."
          : "You can proceed to explicit wallet approval after reviewing the simulation.",
    findings:
      findings.length > 0
        ? findings
        : ["No elevated risk category was detected by the current rules."],
  };
}

function parseModelResponse(content: string): Omit<Explanation, "provider"> {
  const normalized = content
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(normalized) as {
    summary?: unknown;
    recommendation?: unknown;
    findings?: unknown;
  };

  if (
    typeof parsed.summary !== "string" ||
    typeof parsed.recommendation !== "string" ||
    !Array.isArray(parsed.findings) ||
    !parsed.findings.every((finding) => typeof finding === "string")
  ) {
    throw new Error("The explanation model returned an invalid shape.");
  }

  return {
    summary: parsed.summary,
    recommendation: parsed.recommendation,
    findings: parsed.findings,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    analysis?: TransactionAnalysis;
    simulation?: SimulationSummary;
  } | null;

  if (!body?.analysis || !Array.isArray(body.analysis.risks)) {
    return NextResponse.json(
      { error: "A structured transaction analysis is required." },
      { status: 400 },
    );
  }

  const fallback = rulesExplanation(body.analysis, body.simulation);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        {
          role: "system",
          content:
            "You are Proofline, a cautious Solana transaction safety reviewer. Explain only the provided facts. Never claim a transaction is safe with certainty. Return JSON with string fields summary and recommendation, plus a string array findings.",
        },
        {
          role: "user",
          content: JSON.stringify({
            analysis: body.analysis,
            simulation: body.simulation,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ ...fallback, provider: "rules" });
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json(fallback);
  }

  try {
    return NextResponse.json({
      provider: "openai",
      ...parseModelResponse(content),
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
