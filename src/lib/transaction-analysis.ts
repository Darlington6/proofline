export type TransactionInstruction = {
  program: string;
  action: string;
  detail: string;
  level: "safe" | "review";
};

export type TransactionAnalysis = {
  signature: string;
  slot: number;
  feeSol: number;
  status: "confirmed" | "failed";
  instructions: TransactionInstruction[];
  riskLevel: "low" | "medium" | "high";
  riskSummary: string;
};

type ParsedInstruction = {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
};

type TransactionResult = {
  slot: number;
  meta: {
    err: unknown;
    fee: number;
  } | null;
  transaction: {
    message: {
      instructions: ParsedInstruction[];
    };
  };
};

function formatAddress(value: unknown) {
  if (typeof value !== "string") return "unknown account";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function describeInstruction(
  instruction: ParsedInstruction,
): TransactionInstruction {
  const program = instruction.program ?? "Unknown program";
  const type = instruction.parsed?.type;
  const info = instruction.parsed?.info ?? {};

  if (program === "system" && type === "transfer") {
    const lamports = typeof info.lamports === "number" ? info.lamports : 0;
    return {
      program: "System Program",
      action: "SOL transfer",
      detail: `${(lamports / 1_000_000_000).toFixed(4)} SOL to ${formatAddress(info.destination)}`,
      level: "safe",
    };
  }

  if (
    program === "spl-token" &&
    (type === "transfer" || type === "transferChecked")
  ) {
    return {
      program: "Token Program",
      action: "Token transfer",
      detail: `Token movement to ${formatAddress(info.destination)}`,
      level: "review",
    };
  }

  if (program === "compute-budget") {
    return {
      program: "Compute Budget",
      action: "Compute budget request",
      detail: "Adjusts the resources available to this transaction.",
      level: "safe",
    };
  }

  return {
    program,
    action: type ?? "Program instruction",
    detail: "Program-specific instruction requires review.",
    level: "review",
  };
}

export function analyzeTransaction(
  signature: string,
  result: TransactionResult,
): TransactionAnalysis {
  const instructions =
    result.transaction.message.instructions.map(describeInstruction);
  const hasFailure = result.meta?.err != null;
  const hasReviewInstruction = instructions.some(
    (instruction) => instruction.level === "review",
  );
  const riskLevel = hasFailure
    ? "high"
    : hasReviewInstruction
      ? "medium"
      : "low";

  return {
    signature,
    slot: result.slot,
    feeSol: (result.meta?.fee ?? 0) / 1_000_000_000,
    status: hasFailure ? "failed" : "confirmed",
    instructions,
    riskLevel,
    riskSummary: hasFailure
      ? "This transaction failed on-chain. No approval decision should rely on it."
      : hasReviewInstruction
        ? "This transaction includes program-specific activity. Review each instruction before signing a similar transaction."
        : "The parsed instructions are common system activity. Simulation is still required before signing.",
  };
}
