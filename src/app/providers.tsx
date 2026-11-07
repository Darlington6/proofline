"use client";

import type { ReactNode } from "react";
import { createClient } from "@solana/kit";
import { ClientProvider } from "@solana/react";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

const rpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const client = createClient()
  .use(walletSigner({ chain: "solana:devnet" }))
  .use(solanaRpc({ rpcUrl }));

export type AppClient = Awaited<typeof client>;

export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
