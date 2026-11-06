"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  useConnectedWallet,
  useConnect,
  useDisconnect,
  useWallets,
  WalletReadyGate,
} from "@solana/kit-plugin-wallet/react";
import { client } from "@/app/providers";

const hydrationEvent = "proofline-wallet-hydrated";
let hasHydrated = false;

function subscribeToHydration(callback: () => void) {
  window.addEventListener(hydrationEvent, callback);
  return () => window.removeEventListener(hydrationEvent, callback);
}

function getHydrationSnapshot() {
  return hasHydrated;
}

function getServerHydrationSnapshot() {
  return false;
}

function WalletButtonContent() {
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const { dispatch: connect } = useConnect(client);
  const { dispatch: disconnect } = useDisconnect(client);

  if (connected) {
    return (
      <div className="wallet-status">
        <span className="wallet-address" title={connected.account.address}>
          {connected.account.address.slice(0, 4)}...
          {connected.account.address.slice(-4)}
        </span>
        <button
          className="wallet-button"
          type="button"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <span className="wallet-hint">Install a Wallet Standard wallet</span>
    );
  }

  return (
    <div className="wallet-options">
      {wallets.map((wallet) => (
        <button
          className="primary-button"
          key={wallet.name}
          type="button"
          onClick={() => connect(wallet)}
          aria-label={`Connect ${wallet.name}`}
        >
          Connect wallet <span aria-hidden="true">↗</span>
        </button>
      ))}
    </div>
  );
}

export function WalletButton() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  useEffect(() => {
    hasHydrated = true;
    window.dispatchEvent(new Event(hydrationEvent));
  }, []);

  if (!isHydrated) {
    return <span className="wallet-hint">Looking for wallets...</span>;
  }

  return (
    <WalletReadyGate
      client={client}
      fallback={<span className="wallet-hint">Looking for wallets...</span>}
    >
      <WalletButtonContent />
    </WalletReadyGate>
  );
}
