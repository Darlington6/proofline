import { getAddressEncoder } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  MEMO_PROGRAM,
  MEMO_V1_PROGRAM,
  SYSTEM_PROGRAM,
  isTokenProgram,
} from "./programs";
import type { RawInstruction } from "./types";

/**
 * Solana RPC returns inner instructions in three shapes depending on the
 * method: compiled (account indexes), partially decoded (addresses + base58
 * data), or fully parsed JSON. This module rebuilds the raw instruction from
 * the parsed JSON form so one decoder and one set of risk rules handle all of
 * them.
 */
export type ParsedInnerInstruction = {
  program?: string;
  programId: string;
  parsed: unknown;
};

type Info = Record<string, unknown>;

const addressEncoder = getAddressEncoder();

const TOKEN_TYPES: Record<string, number> = {
  initializeMint: 0,
  initializeAccount: 1,
  transfer: 3,
  approve: 4,
  revoke: 5,
  setAuthority: 6,
  mintTo: 7,
  burn: 8,
  closeAccount: 9,
  freezeAccount: 10,
  thawAccount: 11,
  transferChecked: 12,
  approveChecked: 13,
  mintToChecked: 14,
  burnChecked: 15,
  initializeAccount2: 16,
  syncNative: 17,
  initializeAccount3: 18,
  initializeMint2: 20,
  getAccountDataSize: 21,
  initializeImmutableOwner: 22,
};

const AUTHORITY_TYPES: Record<string, number> = {
  mintTokens: 0,
  freezeAccount: 1,
  accountOwner: 2,
  closeAccount: 3,
};

function str(info: Info, ...keys: string[]) {
  for (const key of keys) {
    const value = info[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function u64(value: unknown) {
  const bytes = new Uint8Array(8);
  const amount =
    typeof value === "number" || typeof value === "string" ? BigInt(value) : 0n;
  new DataView(bytes.buffer).setBigUint64(0, amount, true);
  return bytes;
}

function tokenAmount(info: Info) {
  const nested = info.tokenAmount as
    { amount?: string; decimals?: number } | undefined;
  return {
    amount: nested?.amount ?? info.amount,
    decimals: nested?.decimals ?? 0,
  };
}

function concat(...parts: Array<ArrayLike<number>>) {
  const out: number[] = [];
  for (const part of parts) out.push(...Array.from(part));
  return new Uint8Array(out);
}

function fromSystem(
  type: string,
  info: Info,
): Omit<RawInstruction, "programAddress"> | null {
  switch (type) {
    case "transfer":
      return {
        accounts: [str(info, "source"), str(info, "destination")],
        data: concat([2, 0, 0, 0], u64(info.lamports)),
      };
    case "createAccount":
      return {
        accounts: [str(info, "source"), str(info, "newAccount")],
        data: concat(
          [0, 0, 0, 0],
          u64(info.lamports),
          u64(info.space),
          addressEncoder.encode(str(info, "owner") as never),
        ),
      };
    case "assign":
      return {
        accounts: [str(info, "account")],
        data: concat(
          [1, 0, 0, 0],
          addressEncoder.encode(str(info, "owner") as never),
        ),
      };
    case "allocate":
      return {
        accounts: [str(info, "account")],
        data: concat([8, 0, 0, 0], u64(info.space)),
      };
    default:
      return null;
  }
}

function fromToken(
  type: string,
  info: Info,
): Omit<RawInstruction, "programAddress"> | null {
  const kind = TOKEN_TYPES[type];
  if (kind === undefined) return null;
  const authority = str(
    info,
    "authority",
    "owner",
    "multisigAuthority",
    "multisigOwner",
  );

  switch (type) {
    case "transfer":
      return {
        accounts: [str(info, "source"), str(info, "destination"), authority],
        data: concat([kind], u64(info.amount)),
      };
    case "transferChecked": {
      const { amount, decimals } = tokenAmount(info);
      return {
        accounts: [
          str(info, "source"),
          str(info, "mint"),
          str(info, "destination"),
          authority,
        ],
        data: concat([kind], u64(amount), [decimals]),
      };
    }
    case "approve":
      return {
        accounts: [str(info, "source"), str(info, "delegate"), authority],
        data: concat([kind], u64(info.amount)),
      };
    case "approveChecked": {
      const { amount, decimals } = tokenAmount(info);
      return {
        accounts: [
          str(info, "source"),
          str(info, "mint"),
          str(info, "delegate"),
          authority,
        ],
        data: concat([kind], u64(amount), [decimals]),
      };
    }
    case "setAuthority": {
      const next = str(info, "newAuthority");
      return {
        accounts: [str(info, "account", "mint"), authority],
        data: concat(
          [kind, AUTHORITY_TYPES[str(info, "authorityType")] ?? 255],
          next ? concat([1], addressEncoder.encode(next as never)) : [0],
        ),
      };
    }
    case "closeAccount":
      return {
        accounts: [str(info, "account"), str(info, "destination"), authority],
        data: new Uint8Array([kind]),
      };
    case "mintTo":
    case "mintToChecked": {
      const { amount, decimals } = tokenAmount(info);
      return {
        accounts: [
          str(info, "mint"),
          str(info, "account"),
          str(info, "mintAuthority", "multisigMintAuthority"),
        ],
        data: concat([kind], u64(amount), [decimals]),
      };
    }
    default:
      // Housekeeping instructions: only the discriminator matters for display.
      return {
        accounts: [str(info, "account", "mint", "source")],
        data: concat([kind], new Uint8Array(16)),
      };
  }
}

export function rawFromParsed(
  ix: ParsedInnerInstruction,
  parentIndex: number,
): RawInstruction | null {
  const programAddress = ix.programId;

  if (programAddress === MEMO_PROGRAM || programAddress === MEMO_V1_PROGRAM) {
    const text = typeof ix.parsed === "string" ? ix.parsed : "";
    return {
      programAddress,
      accounts: [],
      data: new TextEncoder().encode(text),
      parentIndex,
    };
  }

  const parsed = ix.parsed as { type?: string; info?: Info } | null;
  const type = parsed?.type ?? "";
  const info = parsed?.info ?? {};

  let rest: Omit<RawInstruction, "programAddress"> | null = null;
  if (programAddress === SYSTEM_PROGRAM) rest = fromSystem(type, info);
  else if (isTokenProgram(programAddress)) rest = fromToken(type, info);
  else if (programAddress === ASSOCIATED_TOKEN_PROGRAM) {
    rest = {
      accounts: [
        str(info, "source"),
        str(info, "account"),
        str(info, "wallet"),
        str(info, "mint"),
      ],
      data: new Uint8Array(
        type === "recoverNested" ? [2] : type === "createIdempotent" ? [1] : [],
      ),
    };
  }

  // Unknown types still surface, with empty data, so they are reviewed.
  return {
    programAddress,
    accounts: rest?.accounts ?? [],
    data: rest?.data ?? new Uint8Array(),
    parentIndex,
  };
}
