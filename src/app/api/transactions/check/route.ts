import { NextResponse } from "next/server";
import type { CheckResult } from "@/lib/analysis/types";
import { explain } from "@/lib/server/explain";
import { inspectUnsignedTransaction } from "@/lib/server/inspect";
import { errorResponse } from "@/lib/server/responses";

/**
 * Decode, simulate, and explain an unsigned transaction.
 * Body: { transaction: base64 string, wallet?: connected wallet address }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    transaction?: unknown;
    wallet?: unknown;
  } | null;

  if (typeof body?.transaction !== "string") {
    return NextResponse.json(
      { error: "Provide a transaction encoded as base64." },
      { status: 400 },
    );
  }
  const wallet = typeof body.wallet === "string" ? body.wallet : undefined;

  try {
    const inspection = await inspectUnsignedTransaction(
      body.transaction,
      wallet,
    );
    const { explanation, riskLevel } = await explain(inspection.analysis);
    const result: CheckResult = { ...inspection, explanation, riskLevel };
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
