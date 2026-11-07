import { createHash } from "node:crypto";
import {
  decompileTransactionMessage,
  getAddressDecoder,
  getBase58Encoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isAddress,
  isWritableRole,
  type CompiledTransactionMessage,
  type CompiledTransactionMessageWithLifetime,
} from "@solana/kit";
import { estimateFeeLamports } from "@/lib/analysis/decode";
import { analyze } from "@/lib/analysis/engine";
import {
  rawFromParsed,
  type ParsedInnerInstruction,
} from "@/lib/analysis/parsed";
import { isTokenProgram, shortAddress } from "@/lib/analysis/programs";
import type {
  BalanceChanges,
  RawInstruction,
  SimulationSummary,
  TokenChange,
  TransactionAnalysis,
} from "@/lib/analysis/types";
import { InputError, rpcCall, type RpcAccount } from "./rpc";

/** Largest legal transaction is 1,232 bytes, which is 1,644 base64 chars. */
export const MAX_TRANSACTION_BASE64_LENGTH = 1_644;
const MAX_WATCHED_ACCOUNTS = 40;

const addressDecoder = getAddressDecoder();
const base58 = getBase58Encoder();
const base64 = getBase64Encoder();

type Compiled = CompiledTransactionMessage &
  CompiledTransactionMessageWithLifetime;

type MessageParts = {
  compiled: Compiled;
  messageBytes: Uint8Array;
  /** Every account key in index order: static, then lookup-table addresses. */
  keys: string[];
  writable: Set<string>;
  signers: string[];
  instructions: RawInstruction[];
};

// ----- Decoding --------------------------------------------------------------

function decodeWire(bytes: Uint8Array) {
  try {
    const transaction = getTransactionDecoder().decode(bytes);
    const messageBytes = new Uint8Array(transaction.messageBytes);
    const compiled = getCompiledTransactionMessageDecoder().decode(
      messageBytes,
    ) as Compiled;
    return { compiled, messageBytes };
  } catch {
    throw new InputError(
      "That payload is not a valid Solana transaction. Paste a base64-encoded transaction.",
    );
  }
}

/** Parse an address lookup table account: 56-byte header, then addresses. */
function parseLookupTable(account: RpcAccount) {
  if (!account) return [];
  const data = new Uint8Array(base64.encode(account.data[0]));
  const addresses: string[] = [];
  for (let offset = 56; offset + 32 <= data.length; offset += 32) {
    addresses.push(addressDecoder.decode(data.subarray(offset, offset + 32)));
  }
  return addresses;
}

async function resolveLookupTables(compiled: Compiled) {
  const lookups =
    "addressTableLookups" in compiled
      ? (compiled.addressTableLookups ?? [])
      : [];
  if (lookups.length === 0) return { writable: [], readonly: [] };

  const { value } = await rpcCall<{ value: RpcAccount[] }>(
    "getMultipleAccounts",
    [
      lookups.map((l) => l.lookupTableAddress),
      { encoding: "base64", commitment: "confirmed" },
    ],
  );
  const writable: string[] = [];
  const readonly: string[] = [];

  lookups.forEach((lookup, i) => {
    const table = parseLookupTable(value[i] ?? null);
    const pick = (index: number) => {
      const address = table[index];
      if (!address) {
        throw new InputError(
          "This transaction references an address lookup table entry that does not exist on Devnet.",
        );
      }
      return address;
    };
    writable.push(...lookup.writableIndexes.map(pick));
    readonly.push(...lookup.readonlyIndexes.map(pick));
  });

  return { writable, readonly };
}

function buildParts(
  compiled: Compiled,
  messageBytes: Uint8Array,
  loaded: { writable: string[]; readonly: string[] },
): MessageParts {
  const { header, staticAccounts } = compiled;
  const signers = staticAccounts.slice(0, header.numSignerAccounts);

  if (compiled.version === 1) {
    // Version 1 messages use a different instruction layout; let Kit decode it.
    const message = decompileTransactionMessage(compiled);
    const writable = new Set<string>([message.feePayer.address]);
    const instructions = message.instructions.map((ix) => {
      for (const account of ix.accounts ?? []) {
        if (isWritableRole(account.role)) writable.add(account.address);
      }
      return {
        programAddress: ix.programAddress,
        accounts: (ix.accounts ?? []).map((a) => a.address),
        data: new Uint8Array(ix.data ?? []),
      };
    });
    return {
      compiled,
      messageBytes,
      keys: [...staticAccounts],
      writable,
      signers,
      instructions,
    };
  }

  const keys = [...staticAccounts, ...loaded.writable, ...loaded.readonly];
  const writable = new Set<string>(loaded.writable);
  const writableSigners =
    header.numSignerAccounts - header.numReadonlySignerAccounts;
  const firstReadonlyNonSigner =
    staticAccounts.length - header.numReadonlyNonSignerAccounts;
  staticAccounts.forEach((address, i) => {
    const isWritable =
      i < writableSigners ||
      (i >= header.numSignerAccounts && i < firstReadonlyNonSigner);
    if (isWritable) writable.add(address);
  });

  const instructions = compiled.instructions.map((ix) => {
    const programAddress = keys[ix.programAddressIndex];
    const accounts = (ix.accountIndices ?? []).map((index) => keys[index]);
    if (!programAddress || accounts.some((a) => a === undefined)) {
      throw new InputError(
        "This transaction references accounts it does not include.",
      );
    }
    return { programAddress, accounts, data: new Uint8Array(ix.data ?? []) };
  });

  return { compiled, messageBytes, keys, writable, signers, instructions };
}

type UiInnerInstruction =
  | { programIdIndex: number; accounts: number[]; data: string }
  | { programId: string; accounts: string[]; data: string }
  | ParsedInnerInstruction;

type UiInnerInstructions = Array<{
  index: number;
  instructions: UiInnerInstruction[];
}>;

/** Normalise the three RPC shapes of inner instructions into raw ones. */
function mapInner(
  groups: UiInnerInstructions | null | undefined,
  keys: string[],
) {
  const inner: RawInstruction[] = [];
  for (const group of groups ?? []) {
    for (const ix of group.instructions) {
      if ("parsed" in ix) {
        const raw = rawFromParsed(ix, group.index);
        if (raw) inner.push(raw);
      } else if ("programIdIndex" in ix) {
        const programAddress = keys[ix.programIdIndex];
        if (!programAddress) continue;
        inner.push({
          programAddress,
          accounts: ix.accounts.map((k) => keys[k]).filter(Boolean),
          data: new Uint8Array(base58.encode(ix.data)),
          parentIndex: group.index,
        });
      } else {
        inner.push({
          programAddress: ix.programId,
          accounts: ix.accounts,
          data: new Uint8Array(base58.encode(ix.data)),
          parentIndex: group.index,
        });
      }
    }
  }
  return inner;
}

// ----- Account state ----------------------------------------------------------

type TokenState = {
  mint: string;
  owner: string;
  amount: bigint;
  delegate: string | null;
  delegatedAmount: bigint;
};

function accountBytes(account: RpcAccount) {
  return account ? new Uint8Array(base64.encode(account.data[0])) : null;
}

export function parseTokenAccount(account: RpcAccount): TokenState | null {
  const data = accountBytes(account);
  if (!account || !data || !isTokenProgram(account.owner)) return null;
  const isAccount =
    data.length === 165 || (data.length > 165 && data[165] === 2);
  if (!isAccount) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    mint: addressDecoder.decode(data.subarray(0, 32)),
    owner: addressDecoder.decode(data.subarray(32, 64)),
    amount: dv.getBigUint64(64, true),
    delegate:
      dv.getUint32(72, true) === 1
        ? addressDecoder.decode(data.subarray(76, 108))
        : null,
    delegatedAmount: dv.getBigUint64(121, true),
  };
}

function parseMintDecimals(account: RpcAccount) {
  const data = accountBytes(account);
  if (!account || !data || !isTokenProgram(account.owner)) return null;
  const isMint = data.length === 82 || (data.length > 165 && data[165] === 1);
  return isMint ? data[44] : null;
}

async function buildBalanceChanges(
  watched: string[],
  before: RpcAccount[],
  after: RpcAccount[] | null,
  wallet: string,
): Promise<BalanceChanges> {
  if (!after) return { sol: [], tokens: [] };

  const decimals = new Map<string, number>();
  watched.forEach((_, i) => {
    for (const account of [before[i], after[i]]) {
      const parsed = parseMintDecimals(account ?? null);
      if (parsed !== null) decimals.set(watched[i], parsed);
    }
  });

  const sol = watched
    .map((address, i) => ({
      address,
      label: address === wallet ? "Your wallet" : shortAddress(address),
      lamportsBefore: before[i]?.lamports ?? 0,
      lamportsAfter: after[i]?.lamports ?? 0,
    }))
    .filter((c) => c.lamportsBefore !== c.lamportsAfter);

  const pending: Array<{
    address: string;
    pre: TokenState | null;
    post: TokenState | null;
  }> = [];
  watched.forEach((address, i) => {
    const pre = parseTokenAccount(before[i] ?? null);
    const post = parseTokenAccount(after[i] ?? null);
    if (!pre && !post) return;
    const changed =
      pre?.amount !== post?.amount ||
      pre?.delegate !== post?.delegate ||
      pre?.delegatedAmount !== post?.delegatedAmount;
    if (changed) pending.push({ address, pre, post });
  });

  const missingMints = [
    ...new Set(
      pending
        .map(({ pre, post }) => (post ?? pre)!.mint)
        .filter((mint) => !decimals.has(mint)),
    ),
  ];
  if (missingMints.length > 0) {
    const { value } = await rpcCall<{ value: RpcAccount[] }>(
      "getMultipleAccounts",
      [missingMints, { encoding: "base64", commitment: "confirmed" }],
    );
    missingMints.forEach((mint, i) => {
      const parsed = parseMintDecimals(value[i] ?? null);
      if (parsed !== null) decimals.set(mint, parsed);
    });
  }

  const tokens: TokenChange[] = pending.map(({ address, pre, post }) => {
    const state = (post ?? pre)!;
    return {
      account: address,
      owner: state.owner,
      mint: state.mint,
      decimals: decimals.get(state.mint) ?? null,
      amountBefore: (pre?.amount ?? 0n).toString(),
      amountAfter: (post?.amount ?? 0n).toString(),
      delegateBefore: pre?.delegate ?? null,
      delegateAfter: post?.delegate ?? null,
      delegatedAmountAfter: (post?.delegatedAmount ?? 0n).toString(),
    };
  });

  return { sol, tokens };
}

// ----- Public entry points ----------------------------------------------------

export type UnsignedInspection = {
  analysis: TransactionAnalysis;
  messageHash: string;
  signableByWallet: boolean;
};

export async function inspectUnsignedTransaction(
  transaction: string,
  walletParam?: string,
): Promise<UnsignedInspection> {
  const trimmed = transaction.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_TRANSACTION_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)
  ) {
    throw new InputError(
      "Provide a transaction encoded as base64 (at most 1,232 bytes).",
    );
  }
  if (walletParam !== undefined && !isAddress(walletParam)) {
    throw new InputError("The wallet address is not a valid Solana address.");
  }

  const { compiled, messageBytes } = decodeWire(
    new Uint8Array(base64.encode(trimmed)),
  );
  const loaded = await resolveLookupTables(compiled);
  const parts = buildParts(compiled, messageBytes, loaded);
  const feePayer = parts.keys[0];
  const wallet = walletParam ?? feePayer;

  const watched = [...new Set([wallet, ...parts.writable])].slice(
    0,
    MAX_WATCHED_ACCOUNTS,
  );

  const [before, simulated] = await Promise.all([
    rpcCall<{ value: RpcAccount[] }>("getMultipleAccounts", [
      watched,
      { encoding: "base64", commitment: "confirmed" },
    ]),
    rpcCall<{
      value: {
        err: unknown;
        logs: string[] | null;
        unitsConsumed?: number;
        accounts?: RpcAccount[] | null;
        innerInstructions?: UiInnerInstructions | null;
      };
    }>("simulateTransaction", [
      trimmed,
      {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
        innerInstructions: true,
        accounts: { encoding: "base64", addresses: watched },
      },
    ]),
  ]);

  const sim = simulated.value;
  const simulation: SimulationSummary = {
    err: sim.err ?? null,
    logs: sim.logs ?? [],
    unitsConsumed: sim.unitsConsumed ?? null,
  };
  const balanceChanges = await buildBalanceChanges(
    watched,
    before.value,
    sim.err ? null : (sim.accounts ?? null),
    wallet,
  );

  const analysis = analyze({
    signature: "unsigned",
    wallet,
    feePayer,
    signers: parts.signers,
    slot: null,
    feeLamports: estimateFeeLamports(parts.signers.length, parts.instructions),
    status: "simulated",
    instructions: parts.instructions,
    innerInstructions: mapInner(sim.innerInstructions, parts.keys),
    balanceChanges,
    simulation,
  });

  return {
    analysis,
    messageHash: createHash("sha256").update(messageBytes).digest("hex"),
    signableByWallet:
      walletParam !== undefined &&
      parts.signers.length === 1 &&
      parts.signers[0] === walletParam,
  };
}

type UiTokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};

export async function inspectConfirmedTransaction(
  signature: string,
): Promise<TransactionAnalysis | null> {
  const result = await rpcCall<{
    slot: number;
    transaction: [string, "base64"];
    meta: {
      err: unknown;
      fee: number;
      preBalances: number[];
      postBalances: number[];
      preTokenBalances?: UiTokenBalance[];
      postTokenBalances?: UiTokenBalance[];
      innerInstructions?: UiInnerInstructions | null;
      loadedAddresses?: { writable: string[]; readonly: string[] };
      logMessages?: string[] | null;
      computeUnitsConsumed?: number;
    } | null;
  } | null>("getTransaction", [
    signature,
    {
      commitment: "confirmed",
      encoding: "base64",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!result) return null;

  const { compiled, messageBytes } = decodeWire(
    new Uint8Array(base64.encode(result.transaction[0])),
  );
  const meta = result.meta;
  const loaded = {
    writable: meta?.loadedAddresses?.writable ?? [],
    readonly: meta?.loadedAddresses?.readonly ?? [],
  };
  const parts = buildParts(compiled, messageBytes, loaded);
  const wallet = parts.keys[0];

  const sol = parts.keys
    .map((address, i) => ({
      address,
      label: address === wallet ? "Fee payer" : shortAddress(address),
      lamportsBefore: meta?.preBalances[i] ?? 0,
      lamportsAfter: meta?.postBalances[i] ?? 0,
    }))
    .filter((c) => c.lamportsBefore !== c.lamportsAfter);

  const tokenIndexes = new Set([
    ...(meta?.preTokenBalances ?? []).map((b) => b.accountIndex),
    ...(meta?.postTokenBalances ?? []).map((b) => b.accountIndex),
  ]);
  const tokens: TokenChange[] = [...tokenIndexes]
    .map((index) => {
      const pre = meta?.preTokenBalances?.find((b) => b.accountIndex === index);
      const post = meta?.postTokenBalances?.find(
        (b) => b.accountIndex === index,
      );
      const state = (post ?? pre)!;
      return {
        account: parts.keys[index],
        owner: state.owner ?? "",
        mint: state.mint,
        decimals: state.uiTokenAmount.decimals,
        amountBefore: pre?.uiTokenAmount.amount ?? "0",
        amountAfter: post?.uiTokenAmount.amount ?? "0",
        // Historical token balances do not include delegate information.
        delegateBefore: null,
        delegateAfter: null,
        delegatedAmountAfter: "0",
      };
    })
    .filter((t) => t.amountBefore !== t.amountAfter);

  return analyze({
    signature,
    wallet,
    feePayer: wallet,
    signers: parts.signers,
    slot: result.slot,
    feeLamports: BigInt(meta?.fee ?? 0),
    status: meta?.err ? "failed" : "confirmed",
    instructions: parts.instructions,
    innerInstructions: mapInner(meta?.innerInstructions, parts.keys),
    balanceChanges: { sol, tokens },
    simulation: {
      err: meta?.err ?? null,
      logs: meta?.logMessages ?? [],
      unitsConsumed: meta?.computeUnitsConsumed ?? null,
    },
  });
}
