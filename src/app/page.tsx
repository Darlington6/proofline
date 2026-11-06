import Link from "next/link";

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
          <span className="network-dot" aria-hidden="true" />
          Devnet preview
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
          <div className="hero-actions">
            <button className="primary-button" type="button">
              Connect wallet <span aria-hidden="true">↗</span>
            </button>
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
          <button className="simulate-button" type="button">
            Simulate transaction
          </button>
        </div>
      </section>

      <section className="workflow shell" aria-labelledby="workflow-title">
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

      <footer className="footer shell">
        <span>Proofline / Solana Hackathon 2026</span>
        <span>AI track · Devnet first</span>
      </footer>
    </main>
  );
}
