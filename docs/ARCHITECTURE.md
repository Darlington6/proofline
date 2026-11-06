# Architecture

Proofline is a Next.js application with both a browser UI and server-side route handlers. It does not need a separate Express server for the current hackathon scope.

## Request Flow

```text
Browser UI
  -> Next.js route handler
  -> Solana Devnet RPC
  -> Structured result
  -> Browser review state
```

## Frontend

- Next.js App Router
- React and TypeScript
- Solana Kit client
- Wallet Standard discovery
- Devnet wallet connection and signing
- Responsive UI with system, light, and dark themes

## Backend

The backend is the `src/app/api/` directory. Next.js runs these route handlers on the server, so API keys and RPC requests do not need to be exposed in browser code.

- `/api/transactions/[signature]` loads and parses historical transactions.
- `/api/transactions/simulate` calls Devnet `simulateTransaction` for unsigned payloads.
- `/api/explain` returns a rules-based explanation or optionally calls the configured model provider.

The Solana RPC URL and optional AI key are read server-side from environment variables. `.env` and `.env.*` files are ignored by Git.

## Trust Boundaries

- Wallet signing always requires an explicit user action in the wallet.
- Simulation uses `sigVerify: false` and does not submit a transaction.
- The AI explanation is advisory and never replaces simulation or wallet review.
- Devnet is the only supported network for development and judging.

## Deferred Protocol Layer

The optional proof receipt remains a future Anchor program. It would commit a transaction hash, explanation hash, wallet, timestamp, and final signature on-chain after the core flow is stable. It is intentionally outside the current backend route handlers.
