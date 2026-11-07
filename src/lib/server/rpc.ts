const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const RPC_TIMEOUT_MS = 12_000;

/** The RPC failed or timed out. Routes map this to HTTP 502. */
export class RpcError extends Error {}

/** The caller sent something we cannot work with. Routes map this to 400. */
export class InputError extends Error {}

export function getRpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

export async function rpcCall<T>(
  method: string,
  params: unknown[],
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "proofline", method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new RpcError(
      timedOut
        ? "The Solana RPC did not respond in time. Try again."
        : "Could not reach the Solana RPC.",
    );
  }

  if (response.status === 429) {
    throw new RpcError(
      "The Solana RPC is rate limiting requests. Wait a moment and try again.",
    );
  }
  if (!response.ok) {
    throw new RpcError(`The Solana RPC returned HTTP ${response.status}.`);
  }

  const payload = (await response.json().catch(() => null)) as {
    result?: T;
    error?: { message?: string };
  } | null;

  if (!payload) throw new RpcError("The Solana RPC returned invalid JSON.");
  if (payload.error) {
    throw new RpcError(
      payload.error.message ?? "The Solana RPC request failed.",
    );
  }
  return payload.result as T;
}

export type RpcAccount = {
  lamports: number;
  owner: string;
  data: [string, "base64"];
} | null;
