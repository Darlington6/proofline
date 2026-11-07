# Architecture

Proofline is a Next.js application with both a browser UI and server-side route handlers. It does not need a separate Express server for the current hackathon scope.

## Request Flow

```text
Browser: scenario builder or pasted payload (base64, unsigned)
  -> POST /api/transactions/check { transaction, wallet }
       1. Decode the wire transaction with Kit (legacy, v0, v1)
       2. Resolve address lookup tables
       3. Read writable accounts (before)
       4. simulateTransaction with inner instructions + account state (after)
       5. Decode every instruction, including inner (CPI) calls
       6. Rules engine -> risk categories
       7. Optional model explanation (can raise risk, never lower it)
  <- { analysis, explanation, riskLevel, messageHash, signableByWallet }
Browser: Approve and sign (exact checked bytes) -> confirm -> review confirmed result
```

## Frontend

- Next.js App Router, React, and TypeScript
- Solana Kit client with Wallet Standard discovery (no legacy wallet adapter)
- `src/lib/client/scenarios.ts` builds real Devnet transactions with `@solana-program/system` and `@solana-program/token`
- `src/lib/client/sign.ts` signs the exact transaction that was checked. When the wallet returns the signed transaction, Proofline compares the message bytes and refuses to send if the wallet changed anything.
- `src/components/analysis-report.tsx` renders the same report for pre-signing checks, confirmed results, and historical lookups

## Backend

The backend is the `src/app/api/` directory. Next.js runs these route handlers on the server, so API keys and RPC requests are not exposed in browser code.

- `POST /api/transactions/check` decodes, simulates, analyses, and explains an unsigned transaction.
- `GET /api/transactions/[signature]` runs the same decoder and rules on a confirmed transaction, using its recorded balances and inner instructions.

Supporting modules:

- `src/lib/analysis/` is the shared engine: instruction decoder, parsed-instruction converter, risk rules, and types.
- `src/lib/server/inspect.ts` talks to the RPC and builds the engine input.
- `src/lib/server/explain.ts` produces the rules-based explanation and, when a key is configured, the model explanation.
- `src/lib/server/rpc.ts` wraps JSON-RPC calls with timeouts and maps failures to clear errors.

`SOLANA_RPC_URL` (server-only) overrides `NEXT_PUBLIC_SOLANA_RPC_URL` for the route handlers. The optional AI key is read server-side only. `.env` and `.env.*` files are ignored by Git.

## Trust Boundaries

- Wallet signing always requires an explicit user action in the wallet.
- Simulation uses `sigVerify: false` and does not submit a transaction.
- The server computes the analysis from the transaction bytes; it never trusts an analysis sent by the browser.
- The rules engine sets the minimum risk. The AI explanation can raise it but never lower it, and it never replaces simulation or wallet review.
- High-risk transactions, failed simulations, and transactions that need other signers cannot be signed from Proofline.
- Devnet is the only supported network for development and judging.

## Deferred Protocol Layer

The optional proof receipt remains a future Anchor program. It would commit a transaction hash, explanation hash, wallet, timestamp, and final signature on-chain after the core flow is stable. It is intentionally outside the current backend route handlers.
