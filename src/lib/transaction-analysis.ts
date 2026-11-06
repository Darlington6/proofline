export type TransactionInstruction = {
  program: string;
  action: string;
  detail: string;
  level: "safe" | "review";
};

export type RiskCategoryKey =
  | "funds-leaving-wallet"
  | "token-approval"
  | "unknown-program"
  | "large-fee"
  | "failed-simulation";

export type RiskCategory = {
  key: RiskCategoryKey;
  label: string;
  severity: "clear" | "review" | "high";
  detail: string;
};

export type TransactionAnalysis = {
  signature: string;
  slot: number;
  feeSol: number;
  status: "confirmed" | "failed";
  instructions: TransactionInstruction[];
  riskLevel: "low" | "medium" | "high";
  riskSummary: string;
  risks: RiskCategory[];
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
    preBalances?: number[];
    postBalances?: number[];
  } | null;
  transaction: {
    message: {
      accountKeys?: Array<{ pubkey: string; signer: boolean }>;
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

  if (
    program === "spl-token" &&
    (type === "approve" || type === "approveChecked" || type === "setAuthority")
  ) {
    return {
      program: "Token Program",
      action: "Token approval or authority change",
      detail: "A delegate or authority may control token movement.",
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
  const feeSol = (result.meta?.fee ?? 0) / 1_000_000_000;
  const feePayer = result.transaction.message.accountKeys?.find(
    (account) => account.signer,
  )?.pubkey;
  const fundsLeaving = result.transaction.message.instructions.some(
    (instruction) =>
      instruction.program === "system" &&
      instruction.parsed?.type === "transfer" &&
      instruction.parsed.info?.source === feePayer &&
      instruction.parsed.info?.destination !== feePayer,
  );
  const hasTokenApproval = result.transaction.message.instructions.some(
    (instruction) =>
      instruction.program === "spl-token" &&
      ["approve", "approveChecked", "setAuthority"].includes(
        instruction.parsed?.type ?? "",
      ),
  );
  const hasUnknownProgram = instructions.some(
    (instruction) =>
      instruction.program !== "system" &&
      instruction.program !== "spl-token" &&
      instruction.program !== "compute-budget",
  );
  const risks: RiskCategory[] = [
    {
      key: "funds-leaving-wallet",
      label: "Funds leaving wallet",
      severity: fundsLeaving ? "review" : "clear",
      detail: fundsLeaving
        ? "This transaction sends SOL away from the fee payer. Confirm the destination and amount."
        : "No direct SOL transfer away from the fee payer was detected.",
    },
    {
      key: "token-approval",
      label: "Token approvals",
      severity: hasTokenApproval ? "high" : "clear",
      detail: hasTokenApproval
        ? "This transaction may grant another account authority over tokens."
        : "No token approval or authority change was detected.",
    },
    {
      key: "unknown-program",
      label: "Unknown programs",
      severity: hasUnknownProgram ? "review" : "clear",
      detail: hasUnknownProgram
        ? "At least one instruction needs program-specific review."
        : "All detected instructions use recognized common programs.",
    },
    {
      key: "large-fee",
      label: "Large fee",
      severity: feeSol > 0.01 ? "review" : "clear",
      detail:
        feeSol > 0.01
          ? `The estimated fee is ${feeSol.toFixed(4)} SOL, above the review threshold.`
          : `The estimated fee is ${feeSol.toFixed(6)} SOL.`,
    },
    {
      key: "failed-simulation",
      label: "Failed simulation",
      severity: hasFailure ? "high" : "clear",
      detail: hasFailure
        ? "The transaction failed on-chain and should not be approved."
        : "The historical transaction completed successfully.",
    },
  ];
  const highestRisk = risks.some((risk) => risk.severity === "high")
    ? "high"
    : risks.some((risk) => risk.severity === "review")
      ? "medium"
      : "low";

  return {
    signature,
    slot: result.slot,
    feeSol,
    status: hasFailure ? "failed" : "confirmed",
    instructions,
    riskLevel: highestRisk,
    riskSummary: hasFailure
      ? "This transaction failed on-chain. No approval decision should rely on it."
      : hasReviewInstruction || hasUnknownProgram
        ? "This transaction includes program-specific activity. Review each instruction before signing a similar transaction."
        : "The parsed instructions are common system activity. Simulation is still required before signing.",
    risks,
  };
}

export function createPreparedTransferAnalysis(
  walletAddress: string,
): TransactionAnalysis {
  return {
    signature: "unsigned-devnet-transfer",
    slot: 0,
    feeSol: 0.000005,
    status: "confirmed",
    instructions: [
      {
        program: "System Program",
        action: "SOL self-transfer",
        detail: `0.0010 SOL from ${formatAddress(walletAddress)} back to the same wallet`,
        level: "safe",
      },
    ],
    riskLevel: "low",
    riskSummary:
      "This unsigned transaction sends 0.001 SOL back to the connected wallet and only requires the network fee after signing.",
    risks: [
      {
        key: "funds-leaving-wallet",
        label: "Funds leaving wallet",
        severity: "clear",
        detail: "The transfer destination matches the connected wallet.",
      },
      {
        key: "token-approval",
        label: "Token approvals",
        severity: "clear",
        detail: "No token approval or authority change is included.",
      },
      {
        key: "unknown-program",
        label: "Unknown programs",
        severity: "clear",
        detail: "Only the System Program is included.",
      },
      {
        key: "large-fee",
        label: "Large fee",
        severity: "clear",
        detail: "The expected fee is below the review threshold.",
      },
      {
        key: "failed-simulation",
        label: "Failed simulation",
        severity: "clear",
        detail: "The transaction has not failed simulation.",
      },
    ],
  };
}
