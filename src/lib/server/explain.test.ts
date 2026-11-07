import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionAnalysis } from "@/lib/analysis/types";
import { explain, parseModelResponse } from "./explain";

function analysis(
  riskLevel: TransactionAnalysis["riskLevel"],
): TransactionAnalysis {
  return {
    signature: "unsigned",
    wallet: "w",
    feePayer: "w",
    signers: ["w"],
    slot: null,
    feeSol: 0.000005,
    status: "simulated",
    instructions: [],
    balanceChanges: { sol: [], tokens: [] },
    simulation: { err: null, logs: [], unitsConsumed: 150 },
    riskLevel,
    riskSummary: "",
    risks: [
      {
        key: "token-approval",
        label: "Token approvals",
        severity: riskLevel === "high" ? "high" : "clear",
        detail: "detail",
      },
    ],
  };
}

function mockModel(content: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(content) } }],
      }),
    ),
  );
}

const modelAnswer = {
  summary: "s",
  recommendation: "r",
  findings: ["f"],
  confidence: "high",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseModelResponse", () => {
  it("accepts a valid answer wrapped in a code fence", () => {
    const parsed = parseModelResponse(
      "```json\n" +
        JSON.stringify({ ...modelAnswer, riskLevel: "low" }) +
        "\n```",
    );
    expect(parsed.riskLevel).toBe("low");
  });

  it("rejects an answer without a risk level", () => {
    expect(() => parseModelResponse(JSON.stringify(modelAnswer))).toThrow();
  });
});

describe("explain", () => {
  it("uses the rules engine when no key is configured", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await explain(analysis("high"));
    expect(result.explanation.provider).toBe("rules");
    expect(result.explanation.fallbackReason).toBe("missing-key");
    expect(result.riskLevel).toBe("high");
  });

  it("uses OPENAI_API_KEY when AI_API_KEY is empty", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "key");
    mockModel({ ...modelAnswer, riskLevel: "low" });
    const result = await explain(analysis("low"));
    expect(result.explanation.provider).toBe("model");
  });

  it("never lets the model lower the rules engine's risk", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    mockModel({ ...modelAnswer, riskLevel: "low" });
    const result = await explain(analysis("high"));
    expect(result.riskLevel).toBe("high");
    expect(result.explanation.raisedRisk).toBe(false);
  });

  it("lets the model raise the risk", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    mockModel({ ...modelAnswer, riskLevel: "high" });
    const result = await explain(analysis("low"));
    expect(result.riskLevel).toBe("high");
    expect(result.explanation.raisedRisk).toBe(true);
  });

  it("falls back to the rules when the provider is unreachable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await explain(analysis("medium"));
    expect(result.explanation.fallbackReason).toBe("provider-error");
  });
});
