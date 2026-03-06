/**
 * Reusable prose / article primitives for the writing section.
 * Designed for long-form technical content with a dark theme.
 */

import { useMemo, useState, type ReactNode } from "react";
import { InteractiveOnly, useRenderMode } from "../../../lib/render-mode";
import { highlightCode } from "../../../lib/shiki";
import { Surface } from "../../Surface";

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */
export function SectionLabel({ children }: { children: ReactNode }) {
  const mode = useRenderMode();
  if (mode === "rss") {
    return null;
  }

  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="h-px w-5 bg-blue-500/60" />
      <span className="text-[11px] font-medium tracking-widest text-blue-400/80 uppercase">
        {children}
      </span>
    </div>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="group mb-4 scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
      style={{ fontFamily: "var(--font-display)" }}
    >
      <a href={`#${id}`} className="no-underline hover:no-underline">
        {children}
        <InteractiveOnly>
          <span className="ml-2 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-700">
            #
          </span>
        </InteractiveOnly>
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="group mb-3 mt-10 scroll-mt-24 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white"
      style={{ fontFamily: "var(--font-display)" }}
    >
      <a href={`#${id}`} className="no-underline hover:no-underline">
        {children}
        <InteractiveOnly>
          <span className="ml-2 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-700">
            #
          </span>
        </InteractiveOnly>
      </a>
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/*  Paragraph                                                          */
/* ------------------------------------------------------------------ */
export function P({ children }: { children: ReactNode }) {
  return <p className="mb-5 leading-[1.8] text-zinc-600 dark:text-zinc-400">{children}</p>;
}

/* ------------------------------------------------------------------ */
/*  Inline code                                                        */
/* ------------------------------------------------------------------ */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded bg-zinc-200 px-1.5 py-0.5 text-[0.85em] text-zinc-700 dark:bg-white/5 dark:text-zinc-300"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
      aria-label="Copy code"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function FileHeader({
  filename,
  language,
  copyText,
}: {
  filename: string;
  language?: string | undefined;
  copyText: string;
}) {
  const mode = useRenderMode();
  if (mode === "rss") {
    return (
      <p>
        <strong>{filename}</strong>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-white/5">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-zinc-500 dark:text-zinc-600"
        aria-hidden
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span
        className="text-[11px] text-zinc-600 dark:text-zinc-500"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {filename}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {language && (
          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-white/5">
            {language}
          </span>
        )}
        <CopyButton text={copyText} />
      </span>
    </div>
  );
}

function HighlightedCode({
  code,
  diff,
  lang,
}: {
  code: string;
  diff?: boolean | undefined;
  lang?: string | undefined;
}) {
  const html = useMemo(() => highlightCode(code, lang), [code, lang]);

  const lines = code.split("\n");
  const lineHtmls = lines.map((line) => {
    const isDiffLine = line.startsWith("+") || line.startsWith("-");
    const toHighlight = isDiffLine ? line.slice(1) : line;
    return highlightCode(toHighlight, lang);
  });

  if (!diff) {
    return (
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code
          style={{ fontFamily: "var(--font-mono)" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }

  return (
    <pre className="overflow-x-auto py-4 text-[13px] leading-relaxed">
      <code style={{ fontFamily: "var(--font-mono)" }}>
        {lines.map((raw, i) => {
          const isAdd = raw.startsWith("+");
          const isRemove = raw.startsWith("-");
          const lineClass = isAdd
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : isRemove
              ? "bg-red-500/10 text-red-700 dark:text-red-400 line-through decoration-red-400/30"
              : "";

          if (isAdd || isRemove) {
            return (
              <div key={i} className={`px-4 ${lineClass}`}>
                <span
                  className={`mr-2 select-none font-semibold ${isAdd ? "text-emerald-500" : "text-red-500"}`}
                >
                  {raw[0]}
                </span>
                <span dangerouslySetInnerHTML={{ __html: lineHtmls[i] ?? "" }} />
              </div>
            );
          }

          return (
            <div key={i} className={`px-4 ${lineClass}`}>
              {/* Invisible prefix to align with +/- diff lines */}
              <span className="mr-2 inline-block w-[1ch] select-none" aria-hidden>
                {" "}
              </span>
              <span dangerouslySetInnerHTML={{ __html: lineHtmls[i] || "&nbsp;" }} />
            </div>
          );
        })}
      </code>
    </pre>
  );
}

/* ------------------------------------------------------------------ */
/*  Code block with filename and syntax highlighting                   */
/* ------------------------------------------------------------------ */
export function CodeBlock({
  filename,
  language,
  children,
}: {
  filename?: string;
  language?: string;
  children: string;
}) {
  const mode = useRenderMode();
  if (mode === "rss") {
    return (
      <>
        {filename && (
          <p>
            <strong>{filename}</strong>
          </p>
        )}
        <pre>
          <code>{children}</code>
        </pre>
      </>
    );
  }

  return (
    <Surface variant="code" className="group relative my-6 overflow-hidden">
      {filename ? (
        <FileHeader filename={filename} language={language} copyText={children} />
      ) : (
        <div className="absolute top-2.5 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={children} />
        </div>
      )}
      <HighlightedCode code={children} lang={language} />
    </Surface>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable code block: preview (optionally diff) + full toggle     */
/* ------------------------------------------------------------------ */
export function ExpandableCodeBlock({
  filename,
  language,
  preview,
  full,
  diff = false,
}: {
  filename?: string;
  language?: string;
  preview: string;
  full: string;
  diff?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Surface variant="code" className="group relative my-6 overflow-hidden">
      {filename && <FileHeader filename={filename} language={language} copyText={full} />}
      <HighlightedCode code={expanded ? full : preview} diff={!expanded && diff} lang={language} />
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-200/80 py-2 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-200/30 hover:text-zinc-700 dark:border-white/5 dark:text-zinc-600 dark:hover:bg-white/3 dark:hover:text-zinc-300"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        {expanded ? "Show relevant code" : "Show full file"}
      </button>
    </Surface>
  );
}

/* ------------------------------------------------------------------ */
/*  Callout (note / warning / tip)                                     */
/* ------------------------------------------------------------------ */
const calloutStyles = {
  note: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    icon: "text-blue-400",
    label: "Note",
    emoji: "📝",
  },
  warning: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "text-amber-400",
    label: "Warning",
    emoji: "⚠️",
  },
  tip: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-400",
    label: "Tip",
    emoji: "💡",
  },
  danger: {
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    icon: "text-red-400",
    label: "Danger",
    emoji: "🚨",
  },
};

export function Callout({
  type = "note",
  children,
}: {
  type?: keyof typeof calloutStyles;
  children: ReactNode;
}) {
  const mode = useRenderMode();
  const s = calloutStyles[type];

  if (mode === "rss") {
    return (
      <blockquote>
        <p>
          <strong>
            {s.emoji} {s.label}
          </strong>
        </p>
        <p>{children}</p>
      </blockquote>
    );
  }

  return (
    <div className={`my-6 rounded-xl border ${s.border} ${s.bg} p-5`}>
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-1.5 w-1.5 rounded-full ${s.icon} bg-current`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${s.icon}`}>
          {s.label}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ordered / Unordered lists                                          */
/* ------------------------------------------------------------------ */
export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-5 space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mb-5 list-decimal space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
      {children}
    </ol>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="leading-[1.7]">
      <span className="relative -left-1">{children}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Comparison table                                                   */
/* ------------------------------------------------------------------ */
export function Table({ headers, rows }: { headers: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <Surface variant="outline" className="my-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-white/5 dark:bg-white/2">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-white/3">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}

/* ------------------------------------------------------------------ */
/*  Horizontal rule / section divider                                  */
/* ------------------------------------------------------------------ */
export function Divider() {
  return <hr className="my-12 border-0 border-t border-zinc-200 dark:border-white/5" />;
}

/* ------------------------------------------------------------------ */
/*  Strong / emphasis helpers                                          */
/* ------------------------------------------------------------------ */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{children}</strong>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      className="text-blue-600 underline decoration-blue-400/40 underline-offset-2 transition-colors hover:text-blue-700 hover:decoration-blue-500/50 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:text-blue-300 dark:hover:decoration-blue-300/50"
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible / details section                                      */
/* ------------------------------------------------------------------ */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Surface variant="outline" className="my-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-white/2"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 px-5 pt-4 pb-5 dark:border-white/5">
          {children}
        </div>
      )}
    </Surface>
  );
}
