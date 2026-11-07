import { NextResponse } from "next/server";
import { explain } from "@/lib/server/explain";
import { inspectConfirmedTransaction } from "@/lib/server/inspect";
import { errorResponse } from "@/lib/server/responses";

const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ signature: string }> },
) {
  const { signature } = await params;

  if (!signaturePattern.test(signature)) {
    return NextResponse.json(
      { error: "Enter a valid Solana transaction signature." },
      { status: 400 },
    );
  }

  try {
    const analysis = await inspectConfirmedTransaction(signature);
    if (!analysis) {
      return NextResponse.json(
        {
          error: "Transaction not found on Devnet. It may still be confirming.",
        },
        { status: 404 },
      );
    }
    const { explanation, riskLevel } = await explain(analysis);
    return NextResponse.json({ analysis, explanation, riskLevel });
  } catch (error) {
    return errorResponse(error);
  }
}
