import { Sandbox } from "@i2-labs/sandbox";
import type { ReactNode } from "react";
import { Page } from "../components/Page";
import { Component, useCallback, useEffect, useRef, useState } from "react";

const AUTO_RUN_DEBOUNCE_MS = 500;

class SandboxErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void; fallback: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  override state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error): {
    hasError: boolean;
    error: Error | null;
  } {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const EXAMPLES: Array<{
  label: string;
  description: string;
  tag: "safe" | "blocked" | "prompt";
  code: string;
}> = [
  {
    label: "Interactive counter",
    description: "useState, event handlers — works fine",
    tag: "safe",
    code: `import { useState } from 'react';

export default function App({ message }) {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, marginBottom: 8, fontSize: 24 }}>
        {message ?? 'Hello from the sandbox'}
      </h1>
      <p style={{ color: '#888', marginBottom: 20 }}>Count: {count}</p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{
          padding: '10px 20px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Increment
      </button>
    </div>
  );
}
`,
  },
  {
    label: "fetch()",
    description: "Prompts for permission — allow or deny",
    tag: "prompt",
    code: `import { useState, useEffect } from 'react';

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
        const data = await res.json();
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    }
    go();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        fetch() via capability broker
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        This is a plain <code style={{ background: '#f4f4f5', padding: '2px 6px', borderRadius: 4 }}>fetch()</code> call.
        The sandbox intercepts it and asks you for permission.
      </p>

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderRadius: 10,
          background: '#f8fafc', border: '1px solid #e2e8f0',
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid #3b82f6', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 14, color: '#475569' }}>
            Waiting for permission...
          </span>
          <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: '#fef2f2', border: '1px solid #fca5a5',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 2 }}>
            Permission denied
          </div>
          <div style={{ fontSize: 12, color: '#991b1b' }}>{error}</div>
        </div>
      )}

      {result && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #86efac',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
            Response received
          </div>
          <pre style={{
            margin: 0, fontSize: 12, color: '#15803d',
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
`,
  },
  {
    label: "document.cookie",
    description: "Cookie access — prompts for permission",
    tag: "prompt",
    code: `import { useState, useEffect } from 'react';

export default function App() {
  const [cookies, setCookies] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sandbox.cookie.get().then(setCookies).catch(() => setCookies('(error)')).finally(() => setLoading(false));
  }, []);

  const handleSet = () => {
    const value = 'test=' + Date.now() + '; path=/';
    sandbox.cookie.set(value).then(setCookies).catch(() => setCookies('(error)'));
  };

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>document.cookie</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Cookie access goes through the capability broker. You'll be prompted for permission.
      </p>
      <div style={{
        padding: 16, borderRadius: 8,
        background: loading ? '#f8fafc' : '#f0fdf4',
        border: loading ? '1px solid #e2e8f0' : '1px solid #86efac',
        color: loading ? '#475569' : '#166534',
        fontSize: 14,
      }}>
        <strong>document.cookie:</strong> {loading ? 'Loading...' : (cookies || '(empty)')}
      </div>
      <button
        onClick={handleSet}
        style={{
          marginTop: 12,
          padding: '8px 16px',
          background: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Set cookie
      </button>
    </div>
  );
}
`,
  },
  {
    label: "sandbox.storage",
    description: "Key-value storage — prompts for permission",
    tag: "prompt",
    code: `import { useState, useEffect } from 'react';

export default function App() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sandbox.storage.get('demo').then((res) => {
      setValue(res?.value ?? '(empty)');
    }).catch(() => setValue('(error)')).finally(() => setLoading(false));
  }, []);

  const handleSet = () => {
    const v = 'Saved at ' + new Date().toLocaleTimeString();
    sandbox.storage.set('demo', v).then(() => setValue(v)).catch(() => setValue('(error)'));
  };

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>sandbox.storage</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Key-value storage via the capability broker. Isolated from host localStorage.
      </p>
      <div style={{
        padding: 16, borderRadius: 8,
        background: loading ? '#f8fafc' : '#f0fdf4',
        border: loading ? '1px solid #e2e8f0' : '1px solid #86efac',
        color: loading ? '#475569' : '#166534',
        fontSize: 14,
      }}>
        <strong>value:</strong> {loading ? 'Loading...' : value}
      </div>
      <button
        onClick={handleSet}
        style={{
          marginTop: 12,
          padding: '8px 16px',
          background: '#a855f7',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Save value
      </button>
    </div>
  );
}
`,
  },
  {
    label: "External <img>",
    description: "Image from URL — blocked by CSP",
    tag: "blocked",
    code: `import { useState, useEffect } from 'react';

export default function App() {
  const [status, setStatus] = useState('Loading image...');

  useEffect(() => {
    const img = new Image();
    img.onload = () => setStatus('Image loaded (this should not happen!)');
    img.onerror = () => setStatus('BLOCKED: Image failed to load');
    img.src = 'https://picsum.photos/200/200';
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>External image test</h2>
      <div style={{
        padding: 16,
        borderRadius: 8,
        background: status.startsWith('BLOCKED') ? '#fef2f2' : '#fffbeb',
        border: status.startsWith('BLOCKED')
          ? '1px solid #fca5a5'
          : '1px solid #fde68a',
        color: status.startsWith('BLOCKED') ? '#991b1b' : '#92400e',
        fontSize: 14,
      }}>
        {status}
      </div>
      <img
        src="https://picsum.photos/200/200"
        alt="test"
        style={{ marginTop: 16, borderRadius: 8, background: '#f4f4f5' }}
        width={200}
        height={200}
      />
      <p style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
        CSP \\'img-src data: blob:\\' only allows inline data URIs,
        not external URLs. The broken image above proves it.
      </p>
    </div>
  );
}
`,
  },
];

export function SandboxPlayground() {
  const [code, setCode] = useState(EXAMPLES[0]!.code);
  const [executedCode, setExecutedCode] = useState(EXAMPLES[0]!.code);
  const [activeExample, setActiveExample] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  // Bumping remountKey destroys the error boundary + Sandbox iframe and creates fresh ones.
  const [remountKey, setRemountKey] = useState(0);

  const handleRetry = useCallback(() => {
    setError(null);
    setRendered(false);
    setExecutedCode(code);
    setRemountKey((k) => k + 1);
  }, [code]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const handleRender = useCallback(() => {
    setRendered(true);
  }, []);

  const loadExample = useCallback((index: number) => {
    const example = EXAMPLES[index];
    if (!example) return;
    setActiveExample(index);
    setCode(example.code);
    setError(null);
    setExecutedCode(example.code);
    setRendered(false);
  }, []);

  // Debounced auto-run when code changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executedCodeRef = useRef(executedCode);
  executedCodeRef.current = executedCode;

  useEffect(() => {
    if (!code.trim()) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Skip if already run (e.g. from loadExample)
      if (code === executedCodeRef.current) return;
      setError(null);
      setRendered(false);
      setExecutedCode(code);
    }, AUTO_RUN_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [code]);

  return (
    <Page.Main>
      <div className="mb-6">
        <Page.Hero title="React Sandbox" accentLine={false} viewTransitionName="lab-sandbox-title">
          <p
            className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400"
            style={{ viewTransitionName: "lab-sandbox-description" }}
          >
            Write React code and run it in an isolated iframe. CSP-enforced — no network access, no
            host DOM access. Full React with hooks and interactivity.
          </p>
        </Page.Hero>
      </div>

      {/* Examples row */}
      <div className="mb-5 flex flex-wrap gap-2">
        {EXAMPLES.map((example, i) => (
          <button
            key={example.label}
            type="button"
            onClick={() => loadExample(i)}
            className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
              activeExample === i
                ? "border-zinc-300 bg-zinc-100 dark:border-white/15 dark:bg-white/5"
                : "border-zinc-200 bg-transparent hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/5 dark:hover:border-white/10 dark:hover:bg-white/2"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                example.tag === "safe"
                  ? "bg-emerald-500"
                  : example.tag === "prompt"
                    ? "bg-violet-400"
                    : "bg-red-400"
              }`}
            />
            <div>
              <div
                className={`text-xs font-medium ${
                  activeExample === i
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {example.label}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                {example.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid h-[520px] gap-5 lg:grid-cols-2">
        {/* Code panel */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/8 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-white/5 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
              </div>
              <span
                className="text-xs text-zinc-500 dark:text-zinc-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                editor.tsx
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-600">auto-run</span>
          </div>
          <textarea
            aria-label="Sandbox code editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.7] text-zinc-800 placeholder-zinc-500 outline-none dark:text-zinc-200 dark:placeholder-zinc-600"
            style={{ fontFamily: "var(--font-mono)" }}
            placeholder="export default function App() { ... }"
          />
        </div>

        {/* Preview panel */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/8 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-white/5 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-white/10" />
              </div>
              <span
                className="text-xs text-zinc-500 dark:text-zinc-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              {error ? (
                <span className="max-w-[240px] truncate text-xs text-red-400">{error}</span>
              ) : rendered ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-600">Updating…</span>
              )}
            </div>
          </div>
          <div className="relative flex-1 bg-white">
            {error && (
              <div
                className="absolute inset-0 z-10 flex flex-col gap-3 overflow-auto bg-red-50/95 p-4"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <div className="flex items-center gap-2 text-red-700">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  <span className="text-sm font-semibold">Sandbox error</span>
                </div>
                <pre className="flex-1 overflow-auto rounded bg-red-100/80 p-3 text-xs text-red-900">
                  {error}
                </pre>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="self-start rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                >
                  Try again
                </button>
              </div>
            )}
            <SandboxErrorBoundary
              key={remountKey}
              onError={handleError}
              fallback={
                <div className="flex h-full items-center justify-center p-6 text-sm text-red-600">
                  Component crashed — check the error above
                </div>
              }
            >
              <Sandbox
                props={{ message: "Live in an iframe" }}
                capabilities={{
                  capabilities: ["fetch", "storage", "clipboard", "cookie"],
                }}
                onError={handleError}
                onRender={handleRender}
                style={{ width: "100%", height: "100%", minHeight: 0 }}
              >
                {executedCode}
              </Sandbox>
            </SandboxErrorBoundary>
          </div>
        </div>
      </div>
    </Page.Main>
  );
}
