"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const themeStorageKey = "proofline-theme";
const themeChangeEvent = "proofline-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(themeChangeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(themeChangeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

function getServerThemeSnapshot(): Theme {
  return "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(themeStorageKey);
  } else {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }
  window.dispatchEvent(new Event(themeChangeEvent));
}

function getNextTheme(theme: Theme): Theme {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => {
    const storedTheme = localStorage.getItem(themeStorageKey);
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      window.dispatchEvent(new Event(themeChangeEvent));
    }
  }, []);

  const nextTheme = getNextTheme(theme);
  const label =
    theme === "system"
      ? "System Theme"
      : theme === "light"
        ? "Light Theme"
        : "Dark Theme";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => applyTheme(nextTheme)}
      aria-label={`Current theme: ${label}. Switch to ${nextTheme} theme.`}
      title={`Theme: ${label}`}
    >
      <span className="theme-icon" aria-hidden="true">
        {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
      </span>
      <span>{label}</span>
    </button>
  );
}
