# Deployment (Vercel)

Proofline deploys to Vercel as a standard Next.js app. The UI and the `src/app/api/` route handlers run on the same deployment, so no separate server is needed.

## 1. Before you start

- Run `npm run validate` locally. Vercel runs the same `next build`, so a passing build here should pass there.
- Push your latest work to `main` on [github.com/Darlington6/proofline](https://github.com/Darlington6/proofline).
- Have a [Vercel account](https://vercel.com/signup). Signing up with GitHub makes the import step easier.

## 2. Import the repository

1. Open [vercel.com/new](https://vercel.com/new).
2. Under **Import Git Repository**, choose GitHub and allow Vercel to access the `proofline` repository. You can grant access to that one repository only.
3. Select **Import** next to `Darlington6/proofline`.
4. On the configuration screen, keep the defaults:
   - **Framework Preset:** Next.js (detected automatically)
   - **Root Directory:** `./`
   - **Build Command:** `next build` (default)
   - **Install Command:** `npm install` (default; uses `package-lock.json`)
   - **Output Directory:** leave empty

## 3. Environment variables

On the same screen, open **Environment Variables** and add these values:

| Name                         | Value                           | Required |
| ---------------------------- | ------------------------------- | -------- |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `devnet`                        | Yes      |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Yes      |

`NEXT_PUBLIC_*` values are built into the browser bundle when the app is built. If you change them later, redeploy for the change to take effect.

### AI key: leave it out for the first deploy

Without a key, Proofline uses its rules engine and labels results **Rules-based explanation**. The app works fully in this mode.

Do not add a model key yet. `/api/explain` has no rate limit, so anyone who finds the public URL can spend your provider credit. Add the key after the route has rate limiting, and set a monthly spend cap in your provider's dashboard first.

When you are ready, add these values under **Settings → Environment Variables** and redeploy:

| Name             | Value                                    |
| ---------------- | ---------------------------------------- |
| `OPENAI_API_KEY` | your provider key (mark it as Sensitive) |
| `OPENAI_MODEL`   | `gpt-4o-mini`                            |

For another OpenAI-compatible provider, use `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` instead. Never prefix a secret with `NEXT_PUBLIC_`, because that would expose it in the browser.

## 4. Deploy

Select **Deploy**. The first build takes about one to two minutes. When it finishes, Vercel shows the production URL, for example `https://proofline.vercel.app` or `https://proofline-<suffix>.vercel.app`.

From then on:

- Every push to `main` triggers a new production deploy.
- Every pull request gets its own preview URL, posted on the PR.

## 5. Check the live site

Use a Phantom (or other Wallet Standard) wallet set to **Devnet** with test SOL from the [faucet](https://faucet.solana.com/).

- [ ] The page loads over HTTPS with no console errors.
- [ ] **Connect wallet** finds the wallet and shows the shortened address.
- [ ] **Prepare 0.001 SOL self-transfer** fills the payload box.
- [ ] **Simulate on Devnet** shows "Simulation passed" with logs and compute units.
- [ ] The explanation panel appears (labelled rules-based without a key).
- [ ] **Approve and sign** opens the wallet, and after approval the Explorer link opens the transaction on Devnet.
- [ ] Pasting that signature into **Review signature** loads the parsed result.

Known limitation: the **Risk Lab** buttons only appear in development builds, so they are hidden on Vercel.

## 6. After the first deploy

1. Add the URL to the GitHub repository: **About → ⚙ → Website**.
2. Add the URL to the top of `README.md`.
3. Use this URL in the MLH submission.
4. Optional: rename the project in **Settings → General** to get a cleaner `*.vercel.app` subdomain.

## Troubleshooting

| Symptom                                                 | Fix                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails on Vercel but passes locally                | Open the build log. Make sure `package-lock.json` is committed and run `npm ci && npm run build` locally to reproduce.                                                                                                                                         |
| RPC errors or `429 Too Many Requests`                   | The public Devnet RPC is rate limited. Create a free Devnet RPC endpoint (for example, Helius), restrict it to your Vercel domain, set it as `NEXT_PUBLIC_SOLANA_RPC_URL`, and redeploy. The URL is visible in the browser, so the domain restriction matters. |
| Still says "No model key was detected"                  | Check the variable name and that it is enabled for the **Production** environment, then redeploy. Environment changes do not apply to existing deployments.                                                                                                    |
| Wallet connects but **Approve and sign** stays disabled | The wallet may not support the transaction version the client requests. Test with both Phantom and Solflare and report which one fails.                                                                                                                        |
