# Contributing to Proofline

Thanks for helping make Solana transactions easier to understand.

## Before You Start

- Read [docs/SETUP.md](docs/SETUP.md).
- Create a focused issue before significant feature work.
- Never commit wallet keypairs, seed phrases, private keys, or environment files.

## Development

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run validate
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add transaction explanation panel`
- `fix: handle failed Devnet simulation`
- `docs: clarify wallet setup`
- `chore: update dependencies`

Keep commits small and describe user-visible behavior when possible.

## Pull Requests

- Explain the problem and the approach.
- Include screenshots or a short recording for UI changes.
- Include test or validation steps.
- Call out Devnet assumptions and any security limitations.
- Keep unrelated formatting or refactoring out of the change.
