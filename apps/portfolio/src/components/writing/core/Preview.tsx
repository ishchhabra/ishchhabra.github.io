/**
 * Shared preview UI for article demos (mini-browser chrome, nav, content, etc.).
 * Compound component: Preview.BrowserChrome, Preview.NavBar, etc.
 */

import IframeResizer from "@iframe-resizer/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRenderMode } from "../../../lib/render-mode";
import { SITE_BASE_URL } from "../../../lib/seo";

export const SERVER_DELAY_MS = 1000;

export const THEME_PREVIEW_STORAGE_KEY = "theme-demo";

function BrowserChrome({
  url,
  onRefresh,
  children,
  badge,
  controls,
}: {
  url: string;
  onRefresh: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
  controls?: React.ReactNode;
}) {
  return (
    <div className="my-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/8">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 dark:border-white/5 dark:bg-zinc-900">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="ml-1 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300"
          aria-label="Refresh"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
        <div
          className="flex-1 rounded-md bg-white/80 px-3 py-1 text-[11px] text-zinc-500 dark:bg-white/5 dark:text-zinc-500"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {url}
        </div>
        {badge}
      </div>
      {controls}
      {children}
    </div>
  );
}

function NavBar({
  pages,
  current,
  onNav,
  disabled,
  themeToggle,
  links,
}: {
  pages: string[];
  current: string;
  onNav: (page: string) => void;
  disabled?: boolean;
  themeToggle?: React.ReactNode;
  /** When set, render <Link> for each item (for real navigation). pages[i] maps to links[i].label. */
  links?: { label: string; to: string }[];
}) {
  const baseClass =
    "rounded-md px-3 py-1 text-[13px] font-medium transition-colors " +
    (disabled ? "pointer-events-none opacity-50 " : "");
  const activeClass = "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white";
  const inactiveClass =
    "text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200";

  return (
    <div className="preview-nav-bar flex items-center justify-between border-b border-zinc-200/80 bg-white px-4 py-2 dark:border-white/5 dark:bg-zinc-900">
      <div className="flex gap-1">
        {links
          ? links.map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className={`${baseClass} ${current === label ? activeClass : inactiveClass}`}
              >
                {label}
              </Link>
            ))
          : pages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onNav(p)}
                disabled={disabled}
                className={`${baseClass} ${current === p ? activeClass : inactiveClass}`}
              >
                {p}
              </button>
            ))}
      </div>
      {themeToggle}
    </div>
  );
}

function ThemeToggle({
  theme,
  onToggle,
  disabled,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="preview-theme-toggle rounded-md px-2.5 py-1 text-[13px] text-zinc-500 transition-colors hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-200"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

/**
 * Wraps demo content so theme applies. Adds a single class from theme ("light" | "dark")
 * so all Preview descendants' dark: classes work (app uses @custom-variant dark with .dark).
 * No min-height; content dictates height.
 */
function ThemeShell({
  theme,
  children,
  className = "",
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${theme} ${className}`.trim()}>{children}</div>;
}

/** Wrapper for demo page content: card (avatar + content area). Use inside ThemeShell; styles use dark: classnames. */
function PageContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <div className="space-y-2 px-4 pt-3 pb-4">{children}</div>
    </div>
  );
}

/** Placeholder body for demos: optional title + lorem ipsum. Use inside PageContent; reads as real content, not loading. */
function LoremIpsum({ title }: { title?: string }) {
  return (
    <>
      {title != null && title !== "" && (
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      )}
      <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
        labore et dolore magna aliqua.
      </p>
      <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
        commodo consequat.
      </p>
    </>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2.5 bg-zinc-50 text-[13px] text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500 dark:border-zinc-700 dark:border-t-blue-400" />
      {label}
    </div>
  );
}

function TimerBadge({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        ms > 100
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      }`}
    >
      {ms > 0 ? `${ms}ms` : "<1ms"}
    </span>
  );
}

function StatusBar({
  variant,
  children,
}: {
  variant: "waiting" | "done";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`preview-status-bar px-4 py-2 text-[11px] ${
        variant === "waiting"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-100"
      }`}
    >
      {children}
    </div>
  );
}

function Demo({ url, title }: { url: string; title: string }) {
  const mode = useRenderMode();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  if (mode === "rss") {
    return (
      <p>
        <a href={`${SITE_BASE_URL}${url}`}>▶ Try the interactive demo</a>
      </p>
    );
  }

  return (
    <BrowserChrome url={url} onRefresh={() => setRefreshTrigger((t) => t + 1)}>
      <IframeResizer
        key={refreshTrigger}
        className="w-full"
        license="GPLv3"
        src={url}
        title={title}
      />
    </BrowserChrome>
  );
}

export const Preview = {
  BrowserChrome,
  Demo,
  NavBar,
  ThemeToggle,
  ThemeShell,
  PageContent,
  LoremIpsum,
  Spinner,
  TimerBadge,
  StatusBar,
};
