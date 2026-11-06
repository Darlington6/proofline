# Project Brief

## Working Identity

- Working name: **Proofline**
- Repository: **`Darlington6/proofline`**
- Event: Solana Hackathon, November 6-8, 2026
- Primary target: Top 3 Overall
- Primary prize track: AI
- Frontend: Next.js and TypeScript

## Product Thesis

Proofline is an AI-powered transaction safety layer for Solana. It explains a transaction in plain language, flags suspicious or surprising behavior, simulates it through Solana RPC, and shows the confirmed result after signing.

The winning submission should make Solana necessary to the core experience, not decorative. AI interprets the transaction and communicates risk; Solana provides the wallet, program instructions, simulation, signing, and confirmation.

## Approved Decisions

### 1. User and problem

The first user is a newcomer or everyday Solana user who wants to understand a wallet prompt before approving it.

The primary workflow is:

1. Connect a wallet.
2. Load or inspect a transaction.
3. Generate a structured explanation and risk flags.
4. Simulate the transaction on Devnet.
5. Let the user approve or reject it.
6. Display the confirmed result.

### 2. Prize track

The primary track is **AI**, while Top 3 Overall remains the main target. Best Beginner Hack is a secondary fit because the product makes Solana easier to understand.

### 3. Technical shape

- Frontend: Next.js, React, and TypeScript
- Styling: Tailwind CSS
- Wallet connection: Solana Wallet Standard or the current supported adapter
- Network: Devnet for development and judging
- AI: server-side API route with validated structured output
- Data/indexing: start with direct RPC reads; add infrastructure only when a user workflow requires it

### 4. Custom Solana program

No custom Solana program is planned for the first milestone. We will use RPC simulation, transaction parsing, wallet signing, Devnet confirmation, program inspection, and existing integrations.

An Anchor program is a stretch goal only if we add an on-chain proof receipt containing a transaction hash, AI explanation hash, wallet, timestamp, and final signature. It must not delay the core workflow.

### Current milestone status

- Devnet Wallet Standard connection: complete
- Unsigned transfer preparation and RPC simulation: complete
- Structured risk categories and rules-based explanation: complete
- Optional model-backed explanation endpoint: complete, requires a local API key
- Explicit Devnet signing and Explorer result: complete
- On-chain proof receipt program: not revisited yet; remains a post-MVP stretch goal

## Definition Of Done For The Foundation

- A named product with a specific first user
- One primary workflow that can be demoed in under three minutes
- A working Devnet path with wallet connection
- AI-generated explanations with validated fields and visible uncertainty
- RPC simulation before signing
- Clear transaction states: preparing, awaiting signature, submitted, confirmed, and failed
- A repeatable local setup
- A short architecture diagram and demo script
- Submission copy explaining why Solana matters

## Working Agreements

- Keep secrets and wallet keypairs out of the repository.
- Make small pull requests with runnable changes.
- Test on Devnet early.
- Prefer a narrow, reliable demo over speculative infrastructure.
- Record important product and protocol decisions in `docs/`.
- Use Conventional Commits and focused pull requests.
- Keep CI green before merging.
