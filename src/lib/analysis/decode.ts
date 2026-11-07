import { getAddressDecoder } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  KNOWN_PROGRAMS,
  MEMO_PROGRAM,
  MEMO_V1_PROGRAM,
  SYSTEM_PROGRAM,
  isTokenProgram,
  shortAddress,
} from "./programs";
import { parseReceiptMemo } from "@/lib/receipt";
import type { DecodedInstruction, Effect, RawInstruction } from "./types";

export const U64_MAX = 0xffff_ffff_ffff_ffffn;
const LAMPORTS_PER_SOL = 1_000_000_000;

type Context = { wallet: string };

type Partial = Omit<
  DecodedInstruction,
  "programAddress" | "program" | "known" | "inner" | "invokedBy"
>;

function view(data: Uint8Array) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

const addressDecoder = getAddressDecoder();

function readAddress(data: Uint8Array, offset: number): string {
  const bytes = data.subarray(offset, offset + 32);
  if (bytes.length !== 32) throw new RangeError("address out of range");
  return addressDecoder.decode(bytes);
}

export function formatSol(lamports: bigint | number) {
  return `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}

export function formatTokenAmount(amount: bigint, decimals?: number | null) {
  if (amount === U64_MAX) return "an unlimited amount of";
  if (decimals == null) return `${amount.toString()} base units of`;
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function who(address: string | undefined, ctx: Context) {
  if (!address) return "an unknown account";
  return address === ctx.wallet ? "your wallet" : shortAddress(address);
}

function decodeSystem(ix: RawInstruction, ctx: Context): Partial {
  const data = ix.data;
  const dv = view(data);
  const kind = dv.getUint32(0, true);
  const [a0, a1, a2] = ix.accounts;

  switch (kind) {
    case 0: {
      const lamports = dv.getBigUint64(4, true);
      const owner = readAddress(data, 20);
      return {
        action: "Create account",
        detail: `Creates ${shortAddress(a1)} funded with ${formatSol(lamports)} from ${who(a0, ctx)}, owned by ${KNOWN_PROGRAMS[owner] ?? shortAddress(owner)}.`,
        level: "safe",
        effects: [
          { kind: "account-funding", from: a0, to: a1, lamports } as Effect,
        ],
      };
    }
    case 1: {
      const owner = readAddress(data, 4);
      return {
        action: "Assign account owner",
        detail: `Hands ownership of ${who(a0, ctx)} to ${KNOWN_PROGRAMS[owner] ?? shortAddress(owner)}.`,
        level: a0 === ctx.wallet ? "high" : "review",
        effects: [{ kind: "account-assign", account: a0, newOwner: owner }],
      };
    }
    case 2: {
      const lamports = dv.getBigUint64(4, true);
      const self = a0 === a1;
      return {
        action: self ? "SOL self-transfer" : "SOL transfer",
        detail: `${formatSol(lamports)} from ${who(a0, ctx)} to ${who(a1, ctx)}.`,
        level: self ? "safe" : "review",
        effects: [{ kind: "sol-transfer", from: a0, to: a1, lamports }],
      };
    }
    case 11: {
      const lamports = dv.getBigUint64(4, true);
      return {
        action: "SOL transfer (with seed)",
        detail: `${formatSol(lamports)} from ${who(a0, ctx)} to ${who(a2, ctx)}.`,
        level: a0 === a2 ? "safe" : "review",
        effects: [{ kind: "sol-transfer", from: a0, to: a2, lamports }],
      };
    }
    case 3:
      return {
        action: "Create account (with seed)",
        detail: `Creates ${shortAddress(a1)} funded by ${who(a0, ctx)}.`,
        level: "safe",
        effects: [],
      };
    case 8:
      return {
        action: "Allocate space",
        detail: `Allocates data space for ${who(a0, ctx)}.`,
        level: "safe",
        effects: [],
      };
    case 4:
      return {
        action: "Advance nonce",
        detail: "Uses a durable nonce instead of a recent blockhash.",
        level: "safe",
        effects: [],
      };
    default:
      return {
        action: `System instruction #${kind}`,
        detail: "An uncommon System Program instruction.",
        level: "review",
        effects: [],
      };
  }
}

const AUTHORITY_TYPES = [
  "mint authority",
  "freeze authority",
  "account owner",
  "close authority",
];

function decodeToken(ix: RawInstruction, ctx: Context): Partial {
  const data = ix.data;
  if (data.length === 0) throw new RangeError("empty token instruction");
  const dv = view(data);
  const kind = data[0];
  const a = ix.accounts;

  switch (kind) {
    case 3:
    case 12: {
      const checked = kind === 12;
      const amount = dv.getBigUint64(1, true);
      const decimals = checked ? data[9] : null;
      const [source, mint, destination, authority] = checked
        ? [a[0], a[1], a[2], a[3]]
        : [a[0], undefined, a[1], a[2]];
      return {
        action: "Token transfer",
        detail: `Moves ${formatTokenAmount(amount, decimals)} tokens from ${shortAddress(source)} to ${shortAddress(destination)}, authorised by ${who(authority, ctx)}.`,
        level: "review",
        effects: [
          {
            kind: "token-transfer",
            authority,
            source,
            destination,
            amount,
            mint,
          },
        ],
      };
    }
    case 4:
    case 13: {
      const checked = kind === 13;
      const amount = dv.getBigUint64(1, true);
      const decimals = checked ? data[9] : null;
      const [account, mint, delegate, authority] = checked
        ? [a[0], a[1], a[2], a[3]]
        : [a[0], undefined, a[1], a[2]];
      return {
        action: "Token approval",
        detail: `Lets ${shortAddress(delegate)} spend ${formatTokenAmount(amount, decimals)} tokens from ${shortAddress(account)} without asking again.`,
        level: "high",
        effects: [
          {
            kind: "token-approval",
            authority,
            account,
            delegate,
            amount,
            mint,
          },
        ],
      };
    }
    case 5:
      return {
        action: "Revoke token approval",
        detail: `Removes any delegate from ${shortAddress(a[0])}.`,
        level: "safe",
        effects: [],
      };
    case 6: {
      const type = AUTHORITY_TYPES[data[1]] ?? `authority type ${data[1]}`;
      const newAuthority = data[2] === 1 ? readAddress(data, 3) : null;
      return {
        action: "Change token authority",
        detail: newAuthority
          ? `Transfers the ${type} of ${shortAddress(a[0])} to ${who(newAuthority, ctx)}.`
          : `Removes the ${type} of ${shortAddress(a[0])} permanently.`,
        level: "high",
        effects: [
          {
            kind: "authority-change",
            authority: a[1],
            account: a[0],
            newAuthority,
          },
        ],
      };
    }
    case 7:
    case 14:
      return {
        action: "Mint tokens",
        detail: `Mints ${formatTokenAmount(dv.getBigUint64(1, true), kind === 14 ? data[9] : null)} new tokens into ${shortAddress(a[1])}.`,
        level: "safe",
        effects: [],
      };
    case 8:
    case 15:
      return {
        action: "Burn tokens",
        detail: `Destroys tokens held in ${shortAddress(a[0])}.`,
        level: "review",
        effects: [],
      };
    case 9:
      return {
        action: "Close token account",
        detail: `Closes ${shortAddress(a[0])} and sends its rent to ${who(a[1], ctx)}.`,
        level: a[1] === ctx.wallet ? "safe" : "review",
        effects: [
          {
            kind: "close-account",
            authority: a[2],
            account: a[0],
            destination: a[1],
          },
        ],
      };
    case 0:
    case 20:
      return {
        action: "Initialise mint",
        detail: `Sets up ${shortAddress(a[0])} as a new token mint.`,
        level: "safe",
        effects: [],
      };
    case 1:
    case 16:
    case 18:
      return {
        action: "Initialise token account",
        detail: `Sets up ${shortAddress(a[0])} to hold tokens.`,
        level: "safe",
        effects: [],
      };
    case 10:
      return {
        action: "Freeze token account",
        detail: `Freezes ${shortAddress(a[0])}.`,
        level: "review",
        effects: [],
      };
    case 11:
    case 17:
    case 21:
    case 22:
      return {
        action: "Token account housekeeping",
        detail: "Routine token account setup or sync.",
        level: "safe",
        effects: [],
      };
    default:
      return {
        action: `Token instruction #${kind}`,
        detail: "A token instruction Proofline does not decode in detail yet.",
        level: "review",
        effects: [],
      };
  }
}

function decodeAssociatedToken(ix: RawInstruction, ctx: Context): Partial {
  const [, ata, owner] = ix.accounts;
  return {
    action:
      ix.data[0] === 2
        ? "Recover nested token account"
        : "Create token account",
    detail: `Creates the token account ${shortAddress(ata)} for ${who(owner, ctx)} if it does not exist.`,
    level: "safe",
    effects: [],
  };
}

function decodeComputeBudget(ix: RawInstruction): Partial {
  const dv = view(ix.data);
  const kind = ix.data[0];
  if (kind === 2) {
    return {
      action: "Set compute limit",
      detail: `Caps compute at ${dv.getUint32(1, true).toLocaleString("en-US")} units.`,
      level: "safe",
      effects: [],
    };
  }
  if (kind === 3) {
    return {
      action: "Set priority fee",
      detail: `Pays ${dv.getBigUint64(1, true).toString()} micro-lamports per compute unit for faster inclusion.`,
      level: "safe",
      effects: [],
    };
  }
  return {
    action: "Compute budget request",
    detail: "Adjusts the resources available to this transaction.",
    level: "safe",
    effects: [],
  };
}

function decodeMemo(ix: RawInstruction): Partial {
  const text = new TextDecoder().decode(ix.data);
  const receipt = parseReceiptMemo(text);
  if (receipt) {
    return {
      action: "Proofline receipt",
      detail: `Records that Proofline checked message ${receipt.messageHash.slice(0, 12)}… and found ${receipt.riskLevel} risk.`,
      level: "safe",
      effects: [],
    };
  }
  const shown = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  return {
    action: "Memo",
    detail: `Records the note "${shown}" on-chain.`,
    level: "safe",
    effects: [],
  };
}

export function decodeInstruction(
  ix: RawInstruction,
  ctx: Context,
  invokedBy?: string,
): DecodedInstruction {
  const program = KNOWN_PROGRAMS[ix.programAddress];
  const base = {
    programAddress: ix.programAddress,
    program: program ?? shortAddress(ix.programAddress),
    known: Boolean(program),
    inner: ix.parentIndex !== undefined,
    invokedBy,
  };

  try {
    let decoded: Partial | null = null;
    if (ix.programAddress === SYSTEM_PROGRAM) decoded = decodeSystem(ix, ctx);
    else if (isTokenProgram(ix.programAddress)) decoded = decodeToken(ix, ctx);
    else if (ix.programAddress === ASSOCIATED_TOKEN_PROGRAM)
      decoded = decodeAssociatedToken(ix, ctx);
    else if (ix.programAddress === COMPUTE_BUDGET_PROGRAM)
      decoded = decodeComputeBudget(ix);
    else if (
      ix.programAddress === MEMO_PROGRAM ||
      ix.programAddress === MEMO_V1_PROGRAM
    )
      decoded = decodeMemo(ix);

    if (decoded) return { ...base, ...decoded };
  } catch {
    // Malformed data for a known program: fall through to the generic view.
  }

  return {
    ...base,
    action: program ? "Program instruction" : "Unrecognised program",
    detail: program
      ? "Proofline could not decode this instruction's data."
      : `Proofline cannot decode this program. It touches ${ix.accounts.length} account${ix.accounts.length === 1 ? "" : "s"}.`,
    level: "review",
    effects: [],
  };
}

/** Network fee: 5,000 lamports per signature plus any priority fee. */
export function estimateFeeLamports(
  signatureCount: number,
  instructions: RawInstruction[],
) {
  let unitLimit: number | null = null;
  let microLamportsPerUnit = 0n;
  let otherInstructions = 0;

  for (const ix of instructions) {
    if (ix.programAddress !== COMPUTE_BUDGET_PROGRAM) {
      otherInstructions += 1;
      continue;
    }
    try {
      const dv = view(ix.data);
      if (ix.data[0] === 2) unitLimit = dv.getUint32(1, true);
      if (ix.data[0] === 3) microLamportsPerUnit = dv.getBigUint64(1, true);
    } catch {
      // Ignore malformed compute budget data.
    }
  }

  const units = BigInt(
    unitLimit ?? Math.min(1_400_000, 200_000 * Math.max(otherInstructions, 1)),
  );
  const priority = (units * microLamportsPerUnit + 999_999n) / 1_000_000n;
  return BigInt(signatureCount) * 5_000n + priority;
}
