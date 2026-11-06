import { NextResponse } from "next/server";

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    transaction?: unknown;
  } | null;
  const transaction = body?.transaction;

  if (typeof transaction !== "string" || !base64Pattern.test(transaction)) {
    return NextResponse.json(
      { error: "Provide an unsigned transaction encoded as base64." },
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
      id: "proofline-simulation",
      method: "simulateTransaction",
      params: [
        transaction,
        {
          encoding: "base64",
          replaceRecentBlockhash: true,
          sigVerify: false,
          commitment: "confirmed",
        },
      ],
    }),
    cache: "no-store",
  });

  if (!rpcResponse.ok) {
    return NextResponse.json(
      { error: "The Solana RPC simulation request failed." },
      { status: 502 },
    );
  }

  const payload = (await rpcResponse.json()) as {
    error?: { message?: string };
    result?: {
      value?: {
        err: unknown;
        logs: string[] | null;
        unitsConsumed?: number;
      };
    };
  };

  if (payload.error) {
    return NextResponse.json(
      {
        error:
          payload.error.message ?? "The transaction could not be simulated.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    err: payload.result?.value?.err ?? null,
    logs: payload.result?.value?.logs ?? [],
    unitsConsumed: payload.result?.value?.unitsConsumed ?? null,
  });
}
