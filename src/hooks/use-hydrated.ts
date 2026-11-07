"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during server render and hydration, true once running in the browser. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
