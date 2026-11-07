import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";
import { TransactionReview } from "@/components/transaction-review";
import { ThemeToggle } from "@/components/theme-toggle";
import { SimulationPanel } from "@/components/simulation-panel";
import { MobileMenu } from "@/components/mobile-menu";
import { CurrentYear } from "@/components/current-year";
import { Wallet as WalletIcon } from "lucide-react";

const workflow = [
  {
    number: "01",
    title: "Connect",
    description: "Bring a transaction into a calm, readable review surface.",
  },
  {
    number: "02",
    title: "Understand",
    description:
      "See what moves, which programs act, and what deserves attention.",
  },
  {
    number: "03",
    title: "Confirm",
    description:
      "Simulate on Devnet, then sign only when the outcome makes sense.",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="Proofline home">
          proof<span>line</span>
        </Link>
        <div className="nav-meta">
          <div className="desktop-nav-links">
            <a href="#workflow">Workflow</a>
            <a href="#simulation">Safety Check</a>
            <a href="#review">Review Signature</a>
          </div>
          <a
            className="nav-wallet-link"
            href="#hero-actions"
            aria-label="Go to wallet connection"
            title="Connect wallet"
          >
            <WalletIcon size={18} aria-hidden="true" />
            <span>Wallet</span>
          </a>
          <div className="desktop-theme-toggle">
            <ThemeToggle />
          </div>
          <MobileMenu />
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">A clearer line between intent and approval</p>
          <h1>Understand before you sign.</h1>
          <p className="hero-text">
            Proofline is an AI-powered safety layer for Solana transactions.
            Read the instructions, see the risk, simulate the outcome, then
            decide.
          </p>
          <div className="hero-actions" id="hero-actions">
            <WalletButton />
            <a
              className="text-link"
              href="https://solana.com/docs/intro/quick-start"
            >
              Read the Solana quick start <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        <div className="review-panel" aria-label="Example transaction review">
          <div className="panel-topline">
            <span>TRANSACTION REVIEW</span>
            <span className="status-pill">DEVNET</span>
          </div>
          <div className="review-heading">
            <span className="shield-mark" aria-hidden="true">
              ✓
            </span>
            <div>
              <p className="panel-kicker">Plain-language readout</p>
              <h2>Swap 0.25 SOL for USDC</h2>
            </div>
          </div>
          <div className="review-grid">
            <div>
              <span>Estimated fee</span>
              <strong>~0.000005 SOL</strong>
            </div>
            <div>
              <span>Program activity</span>
              <strong>Jupiter · Token</strong>
            </div>
          </div>
          <div className="risk-note">
            <span aria-hidden="true">i</span>
            <p>
              No unexpected wallet drain detected. Simulation required before
              signing.
            </p>
          </div>
          <a className="simulate-button" href="#simulation">
            Simulate transaction
          </a>
        </div>
      </section>

      <section
        className="workflow shell"
        id="workflow"
        aria-labelledby="workflow-title"
      >
        <div className="section-heading">
          <p className="eyebrow">The first workflow</p>
          <h2 id="workflow-title">A wallet prompt, with context.</h2>
        </div>
        <div className="workflow-grid">
          {workflow.map((step) => (
            <article className="workflow-step" key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div id="simulation">
        <SimulationPanel />
      </div>

      <div id="review">
        <TransactionReview />
      </div>

      <footer className="footer">
        <div className="footer-inner shell">
          <div className="footer-top">
            <div className="footer-brand">
              <Link className="wordmark" href="/">
                proof<span>line</span>
              </Link>
              <p>Understand before you sign.</p>
              <span className="footer-status">
                <span className="network-dot" aria-hidden="true" />
                Devnet first · AI track
              </span>
            </div>
            <div className="footer-links">
              <div>
                <span className="footer-label">Product</span>
                <a href="#workflow">Workflow</a>
                <a href="#simulation">Safety check</a>
                <a href="#review">Review signature</a>
              </div>
              <div>
                <span className="footer-label">Resources</span>
                <a href="https://solana.com/docs/intro/quick-start">
                  Solana Quick Start
                </a>
                <a href="https://faucet.solana.com/">Devnet Faucet</a>
                <a href="https://github.com/Darlington6/proofline">
                  GitHub repository
                </a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              Proofline © <CurrentYear /> · All rights reserved.
            </span>
            <span>Built on Solana Devnet</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
