# Local Setup

This guide establishes the development environment for the Solana Hackathon project.

## Prerequisites

- Git
- Node.js 20 or newer
- A package manager such as pnpm, npm, or yarn
- Rust
- Solana CLI
- Anchor CLI, if the project includes an on-chain program

The official Solana installation guide is the source of truth for platform-specific commands:

- [Solana Quick Start](https://solana.com/docs/intro/quick-start)
- [Solana Installation](https://solana.com/docs/intro/installation)
- [Devnet Faucet](https://faucet.solana.com/)
- [Developer Templates](https://solana.com/developers/templates)
- [Solana Skills](https://solana.com/skills)
- [Blueshift learning courses](https://learn.blueshift.gg/en)
- [Official frontend skill: Solana Kit + Wallet Standard](https://github.com/solana-foundation/solana-dev-skill/blob/main/skills/solana-dev/references/frontend.md)

## Recommended Initial Sequence

1. Install Node.js, Rust, the Solana CLI, and Anchor if needed.
2. Verify each installation:

   ```bash
   node --version
   cargo --version
   solana --version
   anchor --version
   ```

3. Configure the Solana CLI for Devnet:

   ```bash
   solana config set --url https://api.devnet.solana.com
   solana address
   solana balance
   ```

4. Fund the development wallet from the [Solana Devnet Faucet](https://faucet.solana.com/). The faucet currently allows two requests every eight hours; GitHub sign-in can unlock a higher limit, but the normal limit is enough for basic testing.
5. Never commit wallet keypairs, seed phrases, private keys, or `.env` files.
6. The frontend uses Solana Kit with Wallet Standard discovery; do not add the legacy `@solana/wallet-adapter-*` packages.

## Local Environment

Copy the environment template when implementation begins:

```bash
cp .env.example .env.local
```

Keep local values out of Git. Public RPC URLs and wallet addresses may be safe to expose; signing secrets are never safe to expose.

## Verification Checklist

- [ ] `node --version` succeeds
- [ ] `cargo --version` succeeds
- [ ] `solana --version` succeeds
- [ ] `anchor --version` succeeds, if Anchor is approved
- [ ] CLI cluster is Devnet
- [ ] Devnet wallet address is known
- [ ] Devnet wallet has test SOL
- [ ] No secrets are tracked by Git
- [ ] A Wallet Standard wallet is installed in the browser for wallet UI testing

## Phantom Devnet Setup

1. Open Phantom and create a wallet dedicated to development. Do not import a wallet that holds real assets.
2. Open the network selector in Phantom and choose **Devnet**. If Devnet is hidden, enable test networks in Phantom's settings first.
3. Copy the public wallet address from Phantom. Sharing a public address is safe; never share the recovery phrase or private key.
4. Open the [Solana Devnet Faucet](https://faucet.solana.com/), select **devnet**, paste the public address, choose an amount, and select **Confirm Airdrop**.
5. Request again only if needed. The faucet limits unauthenticated users to two requests per eight hours.
6. Confirm the test SOL balance in Phantom, then open the local app and select **Connect wallet**.

If the faucet rejects the request, verify that Phantom is set to Devnet and that the pasted address is the current public address. You can also use the Solana CLI after installing it:

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 1 YOUR_PUBLIC_ADDRESS
solana balance YOUR_PUBLIC_ADDRESS
```

Devnet SOL has no mainnet value and is only for development.

## Testing the Safety Check

Connect Phantom (set to Devnet), then use the scenario buttons in **Run the safety check**. Each one builds a real transaction in the browser, sends it to `/api/transactions/check`, and shows the report. Nothing is signed unless you select **Approve and sign**.

| Scenario                         | Expected risk | What it proves                                                                                               |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| Send 0.001 SOL to yourself       | Low           | A routine transfer passes and can be signed.                                                                 |
| Send 0.01 SOL to a new address   | Medium        | Funds leaving the wallet are flagged. Signing needs an explicit acknowledgement.                             |
| Approve unlimited token spending | High          | A token approval is caught from the instruction and from the simulated account state. Signing stays blocked. |

To test proof receipts, run a scenario and select **Save proof receipt** before **Approve and sign**. Approve the memo in Phantom. After signing the main transaction, follow **Verify the signed transaction against this receipt**. All four checks should pass. The verification page also works without a wallet at `/receipts`.

You can also paste any base64-encoded unsigned transaction. If your connected wallet is not its only signer, Proofline reviews it but does not offer to sign.

Without a connected wallet, scenarios need a funded Devnet address to act as the fee payer in simulation. Set `NEXT_PUBLIC_DEMO_WALLET` to the public address of a Devnet wallet you control and fund it from the faucet. Only the public address is used; simulation does not check signatures, so no key is involved.

## Optional AI Explanations

Proofline works without a model provider. In that mode, the application uses its deterministic rules engine and labels the result **Rules-based explanation**.

To enable model-backed explanations:

1. Create an account with an OpenAI-compatible provider and create an API key from its dashboard.
2. Keep the key only in your local `.env` file. Do not paste it into the browser, source code, GitHub, or a chat message.
3. Add the values below and restart `npm run dev`:

   ```env
   OPENAI_API_KEY=your_private_key
   OPENAI_MODEL=gpt-4o-mini
   ```

The key is read only by the server-side `/api/explain` route. Check the provider's pricing and usage limits before enabling it. An API key is not required for the hackathon demo because the rules-based path remains available.

OpenAI-compatible providers can use the alternate variables:

```env
AI_API_KEY=your_provider_key
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-provider-model
```

A Muse Code or coding-assistant key will work only if that product provides an API endpoint compatible with OpenAI Chat Completions. A key intended only for the Muse Code editor cannot be used by Proofline; in that case, keep the rules-based explanation or use an API key from a model provider.

If the UI still says **Rules-based explanation** after adding the key, stop and restart `npm run dev`. Next.js reads `.env` when the server starts. An invalid key, unavailable model, provider error, or malformed model response also intentionally falls back to the rules engine.

## Automated Tests

Run the test suite with:

```bash
npm test
```

The tests build instructions with the official Kit program clients and cover the decoder, risk rules (including Token-2022 approvals, approvals hidden inside other programs, and delegates that only appear in simulated account state), fee estimation, the AI fallback and risk floor, and the server inspection pipeline with a mocked RPC. Run `npm run validate` before pushing; it includes formatting, type checking, linting, tests, and the production build.
