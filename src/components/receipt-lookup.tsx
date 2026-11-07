/**
 * Home-page entry point for receipt verification. A plain GET form, so it
 * works without JavaScript and lands on the shareable /receipts page.
 */
export function ReceiptLookup() {
  return (
    <section
      className="transaction-review shell"
      aria-labelledby="verify-title"
    >
      <div className="section-heading">
        <p className="eyebrow">Proof on Solana</p>
        <h2 id="verify-title">Verify a receipt.</h2>
      </div>
      <form
        className="signature-form glass-panel receipt-lookup"
        action="/receipts"
        method="get"
      >
        <p>
          A Proofline receipt is a memo the wallet signs before approving. Paste
          its signature, and optionally the signed transaction, to check on
          Devnet that the transaction is exactly the one Proofline reviewed,
          from the same wallet, checked first. The result page is a link you can
          share.
        </p>
        <div className="receipt-inputs">
          <label htmlFor="lookup-receipt">Receipt signature</label>
          <input
            id="lookup-receipt"
            name="receipt"
            placeholder="Receipt signature"
            spellCheck={false}
            autoComplete="off"
            required
          />
          <label htmlFor="lookup-tx">Signed transaction (optional)</label>
          <input
            id="lookup-tx"
            name="tx"
            placeholder="Signature of the transaction you signed"
            spellCheck={false}
            autoComplete="off"
          />
          <button className="primary-button" type="submit">
            Verify on Devnet <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
    </section>
  );
}
