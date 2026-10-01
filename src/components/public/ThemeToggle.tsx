"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * V1 dark-mode toggle (Phase 28), migrated from PBNews/src/components/Header.tsx
 * minus any account handling. The `.dark` class on <html> is the store: the
 * effect applies the stored preference (localStorage, defaulting to the OS
 * preference) and notifies subscribers, so server and client markup always
 * hydrate identically and no state is set inside the effect.
 */
const THEME_EVENT = "pb-theme-change";

function emitChange() {
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

function readSavedTheme(): boolean {
  const saved = localStorage.getItem("theme");
  return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export default function ThemeToggle({ size = "lg" }: { size?: "sm" | "lg" }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", readSavedTheme());
    emitChange();
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    emitChange();
  };

  const iconClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const pillClass =
    size === "sm" ? "glass-pill p-1.5 rounded-lg flex-shrink-0" : "glass-pill p-2 rounded-lg";

  return (
    <button
      onClick={toggleTheme}
      className={pillClass}
      style={{ color: "var(--ink-secondary)" }}
      aria-label="Toggle dark mode"
    >
      {dark ? (
        // V1: dark mode shows the sun (switch back to light)
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // V1: light mode shows the moon (switch to dark)
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
