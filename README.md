# Proofline

**Understand a Solana transaction before you sign it, and prove you checked.**

Proofline simulates a transaction on Solana Devnet, decodes everything it would do (including calls hidden inside other programs), and explains the risk in plain language before your wallet asks you to approve. After you sign, it can show what actually happened, and anyone can verify on-chain that the transaction you signed is exactly the one Proofline checked.

**Live demo (Devnet):** [proofline-topaz.vercel.app](https://proofline-topaz.vercel.app)

Built for the MLH Solana Hackathon, November 6–8, 2026. AI track.

## The problem

Wallet prompts show raw instructions that most people cannot read, so they approve blindly. Many wallet drainers do not steal funds directly. They ask for a token approval that lets a stranger spend your tokens later, and the prompt looks harmless.

## What Proofline does

1. **Simulates the real transaction.** Proofline reads the affected accounts before and after a Devnet simulation and reports real SOL and token changes, plus any new token delegate. Nothing is guessed from the instruction list alone.
2. **Decodes every instruction.** That includes inner (CPI) calls, so a token approval or transfer hidden inside another program is still caught.
3. **Flags the risk.** A rules engine checks six categories and sets the minimum risk level. Medium risk needs an explicit acknowledgement; high risk blocks signing.
4. **Explains it in plain language.** An AI model reads the decoded facts and can raise the risk level, never lower it.
5. **Signs exactly what was checked.** If the wallet changes the transaction while signing, Proofline checks the wallet's version again and only sends it if it is no riskier.
6. **Records a proof receipt on Solana.** The wallet signs a Memo Program note with the risk level and the SHA-256 fingerprint of the checked transaction. A public page proves the signed transaction matches, came from the same wallet, and was checked first.

## Try it in two minutes

You need [Phantom](https://phantom.com/) (or another Wallet Standard wallet) set to **Devnet**, with test SOL from the [Devnet faucet](https://faucet.solana.com/).

1. Open the [live demo](https://proofline-topaz.vercel.app) and connect your wallet.
2. Under **Run the safety check**, pick a scenario:

   | Scenario                         | Expected | What it shows                                                                                                     |
   | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
   | Send 0.001 SOL to yourself       | Low      | A routine transfer passes and can be signed.                                                                      |
   | Send 0.01 SOL to a new address   | Medium   | Funds leaving your wallet are flagged. You must confirm you reviewed the warning.                                 |
   | Approve unlimited token spending | High     | A drainer-style approval is caught from the instruction and from the simulated account state. Signing is blocked. |

3. On the low-risk scenario, select **Save proof receipt**, then **Approve and sign**.
4. Follow **Verify the signed transaction against this receipt**. All four checks should pass.

No wallet? The scenarios still run in review-only mode, and the **Verify a receipt** form works for anyone.

## How it works

```text
Browser builds or receives an unsigned transaction
  -> POST /api/transactions/check
       decode (legacy, v0, v1) and resolve address lookup tables
       read accounts before -> simulateTransaction with inner instructions and account state
       decode every instruction, including inner calls
       rules engine -> six risk categories -> minimum risk level
       AI explanation (optional) -> can raise the risk, never lower it
  <- report + SHA-256 fingerprint of the checked message

Optional receipt: wallet signs a memo "proofline:v1:<risk>:<fingerprint>"
Approve and sign: the exact checked bytes, confirmed on Devnet, then reviewed again
/receipts?receipt=<sig>&tx=<sig>: anyone verifies the match on-chain
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Why Solana

Solana does the core work here; it is not a database bolted onto a web app.

- **Simulation with account state.** `simulateTransaction` returns the post-transaction state of the accounts Proofline asks for, plus inner instructions. That is how Proofline sees real balance changes and a new token delegate before anything is signed.
- **Programs Proofline understands.** System, SPL Token, Token-2022, Associated Token Account, Compute Budget, and Memo instructions are decoded from raw bytes. Unknown programs are flagged for review.
- **Receipts without a backend.** A receipt is a Memo Program instruction that lists the wallet as a signer, so the Memo Program requires the wallet's signature. Slot ordering proves the check came before the transaction. There is no database: Solana is the record, and anyone can re-run the verification.
- **Wallet Standard and Solana Kit.** Wallet discovery, signing, and transaction building use `@solana/kit` and the official `@solana-program/*` clients.

## How AI is used

The AI explains; it does not decide alone.

- The model receives decoded facts only: instructions, inner calls, simulated balance and delegate changes, logs, and the rules engine's verdict. It never sees raw bytes it would have to interpret itself.
- It returns a summary, a recommendation, findings, a risk level, and its confidence.
- Final risk is the higher of the rules engine and the model. The model can catch something the rules miss, but it cannot talk a dangerous transaction down.
- Without a key, or when the provider fails or the per-client AI limit is reached, the rules engine answers and the page says so.

Any OpenAI-compatible chat completions provider works. See [docs/SETUP.md](docs/SETUP.md#optional-ai-explanations).

## Risk categories

| Category          | Flags                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Funds leaving     | SOL or tokens leaving your wallet, from instructions or simulated balances              |
| Token approvals   | Approvals (unlimited is called out) and any new delegate in the simulated account state |
| Authority changes | Token authority changes, or your wallet account being reassigned to another program     |
| Unknown programs  | Any program Proofline cannot decode, including ones called from inside other programs   |
| Large fee         | Fees above 0.01 SOL, including priority fees                                            |
| Simulation        | Failed simulations are treated as high risk                                             |

## Run it locally

Requires Node.js 20 or later.

```bash
git clone https://github.com/Darlington6/proofline.git
cd proofline
npm install
cp .env.example .env
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app works without an AI key. Full setup, including Phantom on Devnet and the optional AI provider: [docs/SETUP.md](docs/SETUP.md). Deploying: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quality

```bash
npm run validate   # format, typecheck, lint, tests, production build
```

45 tests cover the decoder, the rules engine, simulation inspection (with a mocked RPC), AI fallbacks and the never-lower rule, wallet-modified transactions, receipt verification, and rate limits. CI runs the same command on every push.

Server routes have per-client rate limits, RPC and model calls have timeouts, and the server computes every analysis itself instead of trusting the browser.

## Limitations

- **Devnet only.** Proofline is built and tested for Devnet.
- **Simulation is a prediction.** Account state can change between the check and the signature. The post-signing review shows what really happened.
- **Receipts commit to the transaction and risk level**, not to the full explanation text.
- **Historical lookups** cannot show delegate changes, because the RPC does not record them for past transactions.
- **Rate limits are per server instance**, so they stop bursts rather than enforcing an exact global total.

## Project docs

- [Architecture](docs/ARCHITECTURE.md)
- [Local setup](docs/SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Project brief](docs/PROJECT-BRIEF.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md)
