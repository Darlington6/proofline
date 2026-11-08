// Shared shapes for the analysis engine, the API routes, and the UI.

export type Severity = "clear" | "review" | "high";
export type RiskLevel = "low" | "medium" | "high";

/** A raw instruction with every account index already resolved to an address. */
export type RawInstruction = {
  programAddress: string;
  accounts: string[];
  data: Uint8Array;
  /** Index of the top-level instruction that invoked this one (inner only). */
  parentIndex?: number;
};

/** Structured facts the risk rules reason about. */
export type Effect =
  | { kind: "sol-transfer"; from: string; to: string; lamports: bigint }
  | { kind: "account-funding"; from: string; to: string; lamports: bigint }
  | {
      kind: "token-transfer";
      authority: string;
      source: string;
      destination: string;
      amount: bigint;
      mint?: string;
    }
  | {
      kind: "token-approval";
      authority: string;
      account: string;
      delegate: string;
      amount: bigint;
      mint?: string;
    }
  | {
      kind: "authority-change";
      authority: string;
      account: string;
      newAuthority: string | null;
    }
  | { kind: "account-assign"; account: string; newOwner: string }
  | {
      kind: "close-account";
      authority: string;
      account: string;
      destination: string;
    };

export type DecodedInstruction = {
  programAddress: string;
  program: string;
  known: boolean;
  action: string;
  detail: string;
  level: "safe" | "review" | "high";
  inner: boolean;
  /** Name of the top-level program that invoked this inner instruction. */
  invokedBy?: string;
  effects: Effect[];
};

/** What the API returns per instruction: effects (with bigints) stay internal. */
export type InstructionView = Omit<DecodedInstruction, "effects">;

export type SolChange = {
  address: string;
  label: string;
  lamportsBefore: number;
  lamportsAfter: number;
};

export type TokenChange = {
  account: string;
  owner: string;
  mint: string;
  decimals: number | null;
  amountBefore: string;
  amountAfter: string;
  delegateBefore: string | null;
  delegateAfter: string | null;
  delegatedAmountAfter: string;
};

export type BalanceChanges = { sol: SolChange[]; tokens: TokenChange[] };

export type SimulationSummary = {
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
};

export type RiskCategoryKey =
  | "funds-leaving-wallet"
  | "token-approval"
  | "authority-change"
  | "unknown-program"
  | "large-fee"
  | "failed-simulation";

export type RiskCategory = {
  key: RiskCategoryKey;
  label: string;
  severity: Severity;
  detail: string;
};

export type TransactionAnalysis = {
  /** "unsigned" for pre-signing checks, otherwise the transaction signature. */
  signature: string;
  wallet: string;
  feePayer: string;
  signers: string[];
  slot: number | null;
  feeSol: number;
  status: "simulated" | "confirmed" | "failed";
  instructions: InstructionView[];
  balanceChanges: BalanceChanges;
  simulation: SimulationSummary | null;
  riskLevel: RiskLevel;
  riskSummary: string;
  risks: RiskCategory[];
};

export type Explanation = {
  provider: "rules" | "model";
  fallbackReason?:
    "missing-key" | "provider-error" | "invalid-response" | "rate-limited";
  summary: string;
  recommendation: string;
  findings: string[];
  confidence?: "low" | "medium" | "high";
  /** Set when the model rated risk higher than the rules did. */
  raisedRisk?: boolean;
};

export type CheckResult = {
  analysis: TransactionAnalysis;
  explanation: Explanation;
  /** Final risk: the higher of the rules engine and the model. */
  riskLevel: RiskLevel;
  /** SHA-256 of the exact message bytes that were simulated. */
  messageHash: string;
  /** True when the connected wallet is the only required signer. */
  signableByWallet: boolean;
};
