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

## Testing Simulation

The simulation panel accepts an unsigned, base64-encoded transaction payload. It calls Solana's `simulateTransaction` RPC method with signature verification disabled and does not sign or submit the transaction.

Historical transaction signatures cannot be simulated retroactively. The next client-side improvement will construct an unsigned transfer from the connected wallet so this step does not require manually preparing base64.

## Approval Needed Before Implementation

- Product concept and primary user
- Target prize track
- Frontend stack and Solana framework
- Whether we need a custom on-chain program or can compose existing programs
- GitHub repository name and collaborators
