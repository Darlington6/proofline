"use client";

import {
  useConnectedWallet,
  useConnect,
  useDisconnect,
  useWallets,
  WalletReadyGate,
} from "@solana/kit-plugin-wallet/react";
import { client } from "@/app/providers";

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
        >
          Connect {wallet.name} <span aria-hidden="true">↗</span>
        </button>
      ))}
    </div>
  );
}

export function WalletButton() {
  return (
    <WalletReadyGate
      client={client}
      fallback={<span className="wallet-hint">Looking for wallets...</span>}
    >
      <WalletButtonContent />
    </WalletReadyGate>
  );
}
