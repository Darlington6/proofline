"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getYear = () => String(new Date().getFullYear());
const getServerYear = () => "";

export function CurrentYear() {
  const year = useSyncExternalStore(subscribe, getYear, getServerYear);

  return <>{year}</>;
}
