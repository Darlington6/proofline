# Changelog

All notable changes to Proofline will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Server-side transaction inspection: decodes any unsigned transaction, resolves address lookup tables, simulates with inner instructions and account state, and reports real balance and delegate changes.
- Risk rules for Token-2022 approvals, approvals and transfers hidden inside other programs, authority changes, and wallet account reassignment.
- Real Devnet scenarios (low, medium, and high risk) that replace the hard-coded Risk Lab fixtures.
- Exact-bytes signing with a wallet-modification check, confirmation tracking, and a post-signing review.
- When a wallet edits a transaction while signing, Proofline re-checks the wallet's version and sends it only if it is no riskier, still simulates, and costs at most 0.001 SOL more.
- AI explanations that receive decoded instructions and balance changes, report confidence, and can only raise the rules engine's risk.
- Proof receipts: after a check, the wallet can sign a Memo Program note with the risk level and the checked message's SHA-256. A public `/receipts` page verifies on Devnet that a signed transaction matches its receipt, came from the same wallet, and was recorded first.
- Vercel deployment guide.

### Changed

- Historical lookups use the same decoder and rules as pre-signing checks.
- RPC and model calls have timeouts and return clear errors instead of unhandled failures.
- Scenarios set their own compute budget and priority fee, so wallets such as Phantom no longer rewrite them.
- Rules-based explanations for confirmed transactions describe what happened instead of advising whether to sign.

### Removed

- `/api/explain` and `/api/transactions/simulate`, replaced by `/api/transactions/check`.
- Development-only Risk Lab fixtures.

- Initial project brief and Solana Devnet setup guide.
- Next.js and TypeScript application shell.
- Repository contribution, issue, CI, and security foundations.
