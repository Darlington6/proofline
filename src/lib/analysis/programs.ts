export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const COMPUTE_BUDGET_PROGRAM =
  "ComputeBudget111111111111111111111111111111";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const MEMO_V1_PROGRAM = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";

/** Programs the rules engine recognises. Anything else needs review. */
export const KNOWN_PROGRAMS: Record<string, string> = {
  [SYSTEM_PROGRAM]: "System Program",
  [TOKEN_PROGRAM]: "Token Program",
  [TOKEN_2022_PROGRAM]: "Token-2022 Program",
  [ASSOCIATED_TOKEN_PROGRAM]: "Associated Token Account Program",
  [COMPUTE_BUDGET_PROGRAM]: "Compute Budget Program",
  [MEMO_PROGRAM]: "Memo Program",
  [MEMO_V1_PROGRAM]: "Memo Program (v1)",
  AddressLookupTab1e1111111111111111111111111: "Address Lookup Table Program",
  Stake11111111111111111111111111111111111111: "Stake Program",
};

export function isTokenProgram(address: string) {
  return address === TOKEN_PROGRAM || address === TOKEN_2022_PROGRAM;
}

export function shortAddress(value: string | null | undefined) {
  if (!value) return "unknown account";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
