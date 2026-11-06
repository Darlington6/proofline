import { NextResponse } from "next/server";
import {
  analyzeTransaction,
  type TransactionAnalysis,
} from "@/lib/transaction-analysis";

const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

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

  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "proofline",
      method: "getTransaction",
      params: [
        signature,
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 1,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!rpcResponse.ok) {
    return NextResponse.json(
      { error: "The Solana RPC request failed." },
      { status: 502 },
    );
  }

  const payload = (await rpcResponse.json()) as {
    error?: { message?: string };
    result?: Parameters<typeof analyzeTransaction>[1] | null;
  };

  if (payload.error) {
    return NextResponse.json(
      { error: payload.error.message ?? "The Solana RPC request failed." },
      { status: 502 },
    );
  }

  if (!payload.result) {
    return NextResponse.json(
      { error: "Transaction not found on Devnet." },
      { status: 404 },
    );
  }

  const analysis: TransactionAnalysis = analyzeTransaction(
    signature,
    payload.result,
  );
  return NextResponse.json(analysis);
}
