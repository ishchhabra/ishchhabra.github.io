import { Sandbox } from "@i2-labs/sandbox";
import { useState, useCallback, useEffect } from "react";

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
    description: "Cookie access — isolated origin",
    tag: "blocked",
    code: `export default function App() {
  let cookies;
  try {
    cookies = document.cookie || '(empty)';
  } catch (err) {
    cookies = 'ERROR: ' + err.message;
  }

  let storage;
  try {
    localStorage.setItem('test', 'hello');
    storage = localStorage.getItem('test');
  } catch (err) {
    storage = 'BLOCKED: ' + err.message;
  }

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Storage & cookies test</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          padding: 16, borderRadius: 8,
          background: '#f0fdf4', border: '1px solid #86efac',
          color: '#166534', fontSize: 14,
        }}>
          <strong>document.cookie:</strong> {cookies}
          <div style={{ fontSize: 12, marginTop: 4, color: '#15803d' }}>
            Sandbox has an opaque origin — no cookies from the host are visible.
          </div>
        </div>
        <div style={{
          padding: 16, borderRadius: 8,
          background: storage?.startsWith('BLOCKED') ? '#fef2f2' : '#f0fdf4',
          border: storage?.startsWith('BLOCKED')
            ? '1px solid #fca5a5'
            : '1px solid #86efac',
          color: storage?.startsWith('BLOCKED') ? '#991b1b' : '#166534',
          fontSize: 14,
        }}>
          <strong>localStorage:</strong> {storage}
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
            {storage?.startsWith('BLOCKED')
              ? 'Sandboxed iframes without allow-same-origin cannot access localStorage.'
              : 'Storage is ephemeral and isolated to this sandbox instance.'}
          </div>
        </div>
      </div>
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
  const [runKey, setRunKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  const handleRun = useCallback(() => {
    setError(null);
    setRendered(false);
    setExecutedCode(code);
    setRunKey((k) => k + 1);
  }, [code]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const handleRender = useCallback(() => {
    setRendered(true);
  }, []);

  const loadExample = useCallback(
    (index: number) => {
      const example = EXAMPLES[index];
      if (!example) return;
      setActiveExample(index);
      setCode(example.code);
      setError(null);
      setRendered(false);
      setExecutedCode(example.code);
      setRunKey((k) => k + 1);
    },
    [],
  );

  // Cmd/Ctrl+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun]);

  return (
    <main className="relative mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1
          className="mb-2 text-3xl font-bold tracking-tight text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Sandbox
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Write React code and run it in an isolated iframe. CSP-enforced — no
          network access, no host DOM access. Full React with hooks and
          interactivity.
        </p>
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
                ? "border-white/15 bg-white/5"
                : "border-white/5 bg-transparent hover:border-white/10 hover:bg-white/2"
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
                  activeExample === i ? "text-white" : "text-zinc-300"
                }`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {example.label}
              </div>
              <div className="text-[11px] text-zinc-500">
                {example.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid h-[520px] gap-5 lg:grid-cols-2">
        {/* Code panel */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/8 bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>
              <span
                className="text-xs text-zinc-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                editor.tsx
              </span>
            </div>
            <button
              type="button"
              onClick={handleRun}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
              <kbd className="ml-1 rounded bg-emerald-700/60 px-1 py-0.5 text-[10px] text-emerald-200">
                ⌘↵
              </kbd>
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.7] text-zinc-200 placeholder-zinc-600 outline-none"
            style={{ fontFamily: "var(--font-mono)" }}
            placeholder="export default function App() { ... }"
          />
        </div>

        {/* Preview panel */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/8 bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>
              <span
                className="text-xs text-zinc-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              {error ? (
                <span className="max-w-[240px] truncate text-xs text-red-400">
                  {error}
                </span>
              ) : rendered ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              ) : (
                <span className="text-xs text-zinc-600">Waiting...</span>
              )}
            </div>
          </div>
          <div className="flex-1 bg-white">
            <Sandbox
              key={runKey}
              props={{ message: "Live in an iframe" }}
              capabilities={{
                capabilities: ["fetch", "storage", "clipboard"],
              }}
              onError={handleError}
              onRender={handleRender}
              style={{ width: "100%", height: "100%", minHeight: 0 }}
            >
              {executedCode}
            </Sandbox>
          </div>
        </div>
      </div>
    </main>
  );
}
