import { type MemoryVolume, createWorkspace } from "@scelar/nodepod";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { highlightCode } from "../../../lib/shiki";
import { useTheme } from "../../../lib/theme";

// ── Types ────────────────────────────────────────────────────────────

type Workspace = "symlink" | "injected";

interface VfsNode {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  symlinkTarget?: string | undefined;
  children?: VfsNode[];
}

interface HistoryEntry {
  input: string;
  output: string;
  isError: boolean;
  workspace: Workspace;
}

// ── VS Code theme colors ────────────────────────────────────────────

const VS = {
  dark: {
    bg: "#1e1e1e",
    sidebarBg: "#252526",
    activityBarBg: "#333333",
    titleBarBg: "#3c3c3c",
    tabActiveBg: "#1e1e1e",
    tabInactiveBg: "#2d2d2d",
    tabBorder: "#252526",
    statusBarBg: "#007acc",
    statusBarText: "#ffffff",
    terminalBg: "#1e1e1e",
    terminalHeaderBg: "#252526",
    border: "#3c3c3c",
    text: "#cccccc",
    textDim: "#858585",
    textBright: "#ffffff",
    accent: "#007acc",
    green: "#4ec9b0",
    red: "#f14c4c",
    orange: "#ce9178",
    blue: "#569cd6",
    purple: "#c586c0",
    folderName: "#c09553",
    breadcrumb: "#969696",
  },
  light: {
    bg: "#ffffff",
    sidebarBg: "#f3f3f3",
    activityBarBg: "#2c2c2c",
    titleBarBg: "#dddddd",
    tabActiveBg: "#ffffff",
    tabInactiveBg: "#ececec",
    tabBorder: "#f3f3f3",
    statusBarBg: "#007acc",
    statusBarText: "#ffffff",
    terminalBg: "#ffffff",
    terminalHeaderBg: "#f3f3f3",
    border: "#e5e5e5",
    text: "#333333",
    textDim: "#999999",
    textBright: "#000000",
    accent: "#007acc",
    green: "#008000",
    red: "#cd3131",
    orange: "#a31515",
    blue: "#0000ff",
    purple: "#af00db",
    folderName: "#b0841d",
    breadcrumb: "#888888",
  },
} as const;

// ── File icon helpers ────────────────────────────────────────────────

function fileIconColor(name: string): string {
  const ext = name.split(".").pop() ?? "";
  switch (ext) {
    case "js":
      return "#e6cd69";
    case "json":
      return "#cbcb41";
    case "yaml":
    case "yml":
      return "#cb171e";
    default:
      return "#858585";
  }
}

function fileIconLabel(name: string): string {
  const ext = name.split(".").pop() ?? "";
  switch (ext) {
    case "js":
      return "JS";
    case "json":
      return "{}";
    case "yaml":
    case "yml":
      return "Y";
    default:
      return "";
  }
}

// ── Constants ────────────────────────────────────────────────────────

const OWNER = "ishchhabra";
const REPO = "ishchhabra.github.io";
const BRANCH = "main";
const EXAMPLES_DIR = "examples/pnpm-workspace-demo";

const REPO_BASE = `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/${EXAMPLES_DIR}`;

const VARIANT_DIRS: Record<Workspace, string> = {
  symlink: `${EXAMPLES_DIR}/symlink-workspace`,
  injected: `${EXAMPLES_DIR}/injected-workspace`,
};

const ROOT: Record<Workspace, string> = {
  symlink: "/ws-symlink",
  injected: "/ws-injected",
};

const APP_CWD: Record<Workspace, string> = {
  symlink: "/ws-symlink/apps/my-app",
  injected: "/ws-injected/apps/my-app",
};

const SHELL_COMMANDS = /^\s*(clear|ls|cd|cat|pwd|echo|pnpm|npm|node|exit|help)\b/;

// ── Fetch example files from GitHub ──────────────────────────────────

interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
}

async function fetchExampleFiles(): Promise<
  Record<Workspace, Array<{ rel: string; content: string }>>
> {
  const treeRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`,
  );
  if (!treeRes.ok) throw new Error(`GitHub tree API: ${treeRes.status}`);
  const treeData = (await treeRes.json()) as { tree: GitHubTreeEntry[] };

  const filesToFetch: Array<{ workspace: Workspace; repoPath: string; rel: string }> = [];

  for (const [ws, dir] of Object.entries(VARIANT_DIRS) as Array<[Workspace, string]>) {
    const prefix = `${dir}/`;
    for (const entry of treeData.tree) {
      if (entry.type === "blob" && entry.path.startsWith(prefix)) {
        filesToFetch.push({
          workspace: ws,
          repoPath: entry.path,
          rel: entry.path.slice(prefix.length),
        });
      }
    }
  }

  const results = await Promise.all(
    filesToFetch.map(async (f) => {
      const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${f.repoPath}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`Failed to fetch ${f.repoPath}: ${res.status}`);
      const content = await res.text();
      return { workspace: f.workspace, rel: f.rel, content };
    }),
  );

  const files: Record<Workspace, Array<{ rel: string; content: string }>> = {
    symlink: [],
    injected: [],
  };
  for (const r of results) {
    files[r.workspace].push({ rel: r.rel, content: r.content });
  }
  return files;
}

// ── Version annotations ──────────────────────────────────────────────

function noteForPath(path: string): string | undefined {
  if (path.endsWith("lodash/package.json")) {
    if (path.includes("/example-lib/node_modules/")) return "v4.17.20";
    if (path.includes("/my-app/node_modules/")) return "v4.17.21";
  }
  return undefined;
}

// ── VFS setup ────────────────────────────────────────────────────────

function populateWorkspace(
  vol: MemoryVolume,
  root: string,
  mode: Workspace,
  sourceFiles: Array<{ rel: string; content: string }>,
) {
  const lib = `${root}/packages/example-lib`;
  const app = `${root}/apps/my-app`;

  for (const { rel, content } of sourceFiles) {
    const fullPath = `${root}/${rel}`;
    const dir = fullPath.slice(0, fullPath.lastIndexOf("/"));
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(fullPath, content);
  }

  vol.mkdirSync(`${lib}/node_modules/lodash`, { recursive: true });
  vol.writeFileSync(
    `${lib}/node_modules/lodash/package.json`,
    JSON.stringify({ name: "lodash", version: "4.17.20" }, null, 2),
  );

  vol.mkdirSync(`${app}/node_modules/lodash`, { recursive: true });
  vol.writeFileSync(
    `${app}/node_modules/lodash/package.json`,
    JSON.stringify({ name: "lodash", version: "4.17.21" }, null, 2),
  );

  if (mode === "symlink") {
    vol.symlinkSync(lib, `${app}/node_modules/example-lib`);
  } else {
    vol.mkdirSync(`${app}/node_modules/example-lib`, { recursive: true });
    const libPkg = vol.readFileSync(`${lib}/package.json`, "utf8");
    const libIndex = vol.readFileSync(`${lib}/index.js`, "utf8");
    vol.writeFileSync(`${app}/node_modules/example-lib/package.json`, libPkg);
    vol.writeFileSync(`${app}/node_modules/example-lib/index.js`, libIndex);
  }
}

// ── Build tree from live VFS ─────────────────────────────────────────

function buildTree(vol: MemoryVolume, dirPath: string): VfsNode[] {
  let names: string[];
  try {
    names = vol.readdirSync(dirPath);
  } catch {
    return [];
  }

  return names
    .map((name): VfsNode => {
      const full = dirPath === "/" ? `/${name}` : `${dirPath}/${name}`;
      let lstat;
      try {
        lstat = vol.lstatSync(full);
      } catch {
        return { name, path: full, kind: "file" };
      }

      if (lstat.isSymbolicLink()) {
        let target: string | undefined;
        try {
          target = vol.readlinkSync(full);
        } catch {
          /* empty */
        }
        return { name, path: full, kind: "symlink", symlinkTarget: target };
      }

      if (lstat.isDirectory()) {
        return { name, path: full, kind: "dir", children: buildTree(vol, full) };
      }

      return { name, path: full, kind: "file" };
    })
    .sort((a, b) => {
      const aIsDir = a.kind !== "file" ? 0 : 1;
      const bIsDir = b.kind !== "file" ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.localeCompare(b.name);
    });
}

// ── Main component ───────────────────────────────────────────────────

export function LodashResolutionDemo() {
  const { theme } = useTheme();
  const v = VS[theme];

  const wsRef = useRef<ReturnType<typeof createWorkspace> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWs, setActiveWs] = useState<Workspace>("symlink");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [treeVersion, setTreeVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetchExampleFiles()
      .then((files) => {
        if (cancelled) return;
        const ws = createWorkspace({ cwd: "/" });
        populateWorkspace(ws.volume, ROOT.symlink, "symlink", files.symlink);
        populateWorkspace(ws.volume, ROOT.injected, "injected", files.injected);
        wsRef.current = ws;
        setTreeVersion((v) => v + 1);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const trees = useMemo(() => {
    const ws = wsRef.current;
    if (!ws) return { symlink: [], injected: [] };
    return {
      symlink: buildTree(ws.volume, ROOT.symlink),
      injected: buildTree(ws.volume, ROOT.injected),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeVersion]);

  const tree = trees[activeWs];

  const defaultFile = `${ROOT[activeWs]}/packages/example-lib/index.js`;

  const highlightedFile = useMemo(() => {
    const ws = wsRef.current;
    if (!ws) return null;
    const file = selectedFile ?? defaultFile;
    try {
      const raw = ws.volume.readFileSync(file, "utf8");
      const ext = file.split(".").pop() ?? "";
      const langMap: Record<string, string> = {
        js: "javascript",
        json: "json",
        yaml: "shellscript",
        yml: "shellscript",
      };
      const lang = langMap[ext] ?? "plaintext";
      return { html: highlightCode(raw, lang), path: file };
    } catch {
      return null;
    }
  }, [selectedFile, defaultFile, treeVersion]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history]);

  const switchWorkspace = useCallback((ws: Workspace) => {
    setActiveWs(ws);
    setSelectedFile(null);
  }, []);

  const executeCode = useCallback((code: string, ws: Workspace): HistoryEntry => {
    const workspace = wsRef.current;
    if (!workspace) return { input: code, output: "Not loaded yet", isError: true, workspace: ws };
    workspace.engine.clearCache();
    try {
      const res = workspace.execute(`module.exports = (${code})`, `${APP_CWD[ws]}/__repl__.js`);
      return {
        input: code,
        output: formatValue((res as { exports: unknown }).exports),
        isError: false,
        workspace: ws,
      };
    } catch (err: unknown) {
      return {
        input: code,
        output: err instanceof Error ? err.message : String(err),
        isError: true,
        workspace: ws,
      };
    }
  }, []);

  const runCode = useCallback(
    (code: string) => {
      if (code === "clear") {
        setHistory([]);
        setInput("");
        return;
      }
      if (SHELL_COMMANDS.test(code)) {
        setHistory((prev) => [
          ...prev,
          {
            input: code,
            output: 'This is a Node.js REPL \u2014 try require("example-lib")()',
            isError: true,
            workspace: activeWs,
          },
        ]);
        setInput("");
        return;
      }
      setHistory((prev) => [...prev, executeCode(code, activeWs)]);
      setInput("");
    },
    [activeWs, executeCode],
  );

  const compareBoth = useCallback(() => {
    const code = 'require("example-lib")()';
    setHistory((prev) => [...prev, executeCode(code, "symlink"), executeCode(code, "injected")]);
  }, [executeCode]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) runCode(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const filtered = history.filter((h) => h.workspace === activeWs);
      const last = filtered[filtered.length - 1];
      if (last) setInput(last.input);
    }
  };

  const toggleDir = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const displayPath = (p: string) => p.replace(/^\/ws-(symlink|injected)/, "");

  const repoUrl =
    activeWs === "symlink" ? `${REPO_BASE}/symlink-workspace` : `${REPO_BASE}/injected-workspace`;

  const currentFileName = (selectedFile ?? defaultFile).split("/").pop() ?? "";
  const currentFilePath = displayPath(selectedFile ?? defaultFile)
    .replace(/^\//, "")
    .replace(/\//g, " \u203A ");

  // Loading / error states
  if (loading) {
    return (
      <div className="my-8 flex justify-center">
        <div
          className="flex h-64 w-full max-w-3xl items-center justify-center rounded-lg"
          style={{ backgroundColor: v.bg, color: v.textDim }}
        >
          <span className="text-sm">Cloning example from GitHub...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-8 flex justify-center">
        <div
          className="flex h-64 w-full max-w-3xl items-center justify-center rounded-lg"
          style={{ backgroundColor: v.bg, color: v.red }}
        >
          <span className="text-sm">Failed to load: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-8 flex justify-center">
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg shadow-xl"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* ── Title bar ─────────────────────────── */}
        <div
          className="flex items-center"
          style={{ height: 30, backgroundColor: v.titleBarBg }}
        >
          <div className="flex items-center gap-2 px-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#ff5f57" }} />
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#febc2e" }} />
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#28c840" }} />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <span style={{ color: v.textDim, fontSize: 13 }}>
              pnpm-workspace-demo — Visual Studio Code
            </span>
          </div>
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pr-3 text-[10px] transition-opacity hover:opacity-100"
            style={{ color: v.textDim, opacity: 0.6 }}
            title="View source on GitHub"
          >
            GitHub
          </a>
        </div>

        {/* ── Workspace tabs (like VS Code editor group tabs) ── */}
        <div
          className="flex items-stretch"
          style={{
            backgroundColor: v.tabBorder,
            borderBottom: `1px solid ${v.border}`,
          }}
        >
          <WsTab active={activeWs === "symlink"} onClick={() => switchWorkspace("symlink")} v={v}>
            Symlink workspace
          </WsTab>
          <WsTab active={activeWs === "injected"} onClick={() => switchWorkspace("injected")} v={v}>
            Injected workspace
          </WsTab>
          <div className="flex-1" />
        </div>

        <div className="flex" style={{ backgroundColor: v.bg, height: 400 }}>
          {/* ── Activity bar ─────────────────────── */}
          <div
            className="flex shrink-0 flex-col items-center pt-1"
            style={{ width: 40, backgroundColor: v.activityBarBg }}
          >
            {/* Explorer (active — with left border indicator) */}
            <div
              className="flex items-center justify-center"
              style={{ width: 40, height: 40, borderLeft: "2px solid #fff" }}
            >
              {/* codicon: files — two overlapping pages */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={v.textBright} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            {/* Search */}
            <div className="flex items-center justify-center" style={{ width: 40, height: 40 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={v.textDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <circle cx="11" cy="11" r="7" />
                <line x1="16" y1="16" x2="22" y2="22" />
              </svg>
            </div>
            {/* Source Control */}
            <div className="flex items-center justify-center" style={{ width: 40, height: 40 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={v.textDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="12" r="3" />
                <line x1="6" y1="9" x2="6" y2="15" />
                <path d="M9 6h5a4 4 0 014 4v2" />
              </svg>
            </div>
          </div>

          {/* ── Sidebar (file tree) ──────────────── */}
          <div
            className="shrink-0 overflow-y-auto"
            style={{
              width: 220,
              backgroundColor: v.sidebarBg,
              borderRight: `1px solid ${v.border}`,
            }}
          >
            <div
              className="select-none px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: v.textDim }}
            >
              Explorer
            </div>
            <div className="pb-1">
              <TreeView
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                toggleDir={toggleDir}
                selectedFile={selectedFile ?? defaultFile}
                onSelectFile={setSelectedFile}
                v={v}
                displayPath={displayPath}
              />
            </div>
          </div>

          {/* ── Editor area ──────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* File tab */}
            <div
              className="flex items-stretch"
              style={{
                backgroundColor: v.tabBorder,
                height: 35,
              }}
            >
              <div
                className="flex items-center gap-1.5 border-r px-3"
                style={{
                  backgroundColor: v.tabActiveBg,
                  borderColor: v.tabBorder,
                  borderTop: `1px solid ${v.accent}`,
                  color: v.textBright,
                  fontSize: 13,
                }}
              >
                <span style={{ color: fileIconColor(currentFileName), fontSize: 11, fontWeight: 700 }}>{fileIconLabel(currentFileName)}</span>
                {currentFileName}
                <span style={{ color: v.textDim, fontSize: 15, marginLeft: 6 }}>&times;</span>
              </div>
              <div className="flex-1" />
            </div>

            {/* Breadcrumbs */}
            <div
              className="flex items-center px-4"
              style={{
                height: 22,
                backgroundColor: v.bg,
                borderBottom: `1px solid ${v.border}`,
                fontSize: 12,
                color: v.breadcrumb,
              }}
            >
              {currentFilePath}
            </div>

            {/* Source code */}
            <div
              className="flex-1 overflow-auto p-3"
              style={{ backgroundColor: v.bg }}
            >
              {highlightedFile ? (
                <pre
                  className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.65]"
                  dangerouslySetInnerHTML={{ __html: highlightedFile.html }}
                />
              ) : (
                <div
                  className="flex h-full items-center justify-center text-xs"
                  style={{ color: v.textDim }}
                >
                  Select a file to view source
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Terminal ────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${v.border}` }}>
          {/* Terminal header */}
          <div
            className="flex items-center justify-between px-3"
            style={{
              height: 30,
              backgroundColor: v.terminalHeaderBg,
              borderBottom: `1px solid ${v.border}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] font-medium uppercase"
                style={{ color: v.textBright }}
              >
                Terminal
              </span>
            </div>
            <button
              onClick={compareBoth}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: v.accent,
                color: "#fff",
              }}
            >
              Compare both
            </button>
          </div>

          {/* Terminal body */}
          <div
            ref={scrollRef}
            className="overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
            style={{
              backgroundColor: v.terminalBg,
              height: 100,
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {history.length === 0 && (
              <div style={{ color: v.textDim }}>
                Type a JS expression or click &quot;Compare both&quot;
              </div>
            )}
            {history.map((entry, i) => (
              <div key={i} className="mb-0.5">
                <div>
                  <span style={{ color: entry.workspace === "symlink" ? v.blue : v.purple }}>
                    {entry.workspace === "symlink" ? "symlink" : "injected"}
                  </span>
                  <span style={{ color: v.textDim }}>{"> "}</span>
                  <span style={{ color: v.text }}>{entry.input}</span>
                </div>
                <div
                  style={{
                    color: entry.isError ? v.red : v.green,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {entry.output}
                </div>
              </div>
            ))}

            <form onSubmit={handleSubmit} className="flex">
              <span style={{ color: activeWs === "symlink" ? v.blue : v.purple }}>
                {activeWs === "symlink" ? "symlink" : "injected"}
              </span>
              <span style={{ color: v.textDim }}>{"> "}</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border-none bg-transparent pl-1.5 outline-none"
                style={{ color: v.text, caretColor: v.textBright, fontSize: 11 }}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
              />
            </form>
          </div>
        </div>

        {/* ── Status bar ─────────────────────────── */}
        <div
          className="flex items-center justify-between px-2.5"
          style={{
            height: 22,
            backgroundColor: v.statusBarBg,
            color: v.statusBarText,
            fontSize: 11,
          }}
        >
          <div className="flex items-center gap-3">
            <span>&#9095; main</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => runCode('require("example-lib")()')}
              className="transition-opacity hover:opacity-80"
              style={{ color: v.statusBarText, fontSize: 10 }}
            >
              require(&quot;example-lib&quot;)()
            </button>
            <span>JavaScript</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tree view ────────────────────────────────────────────────────────

type VsTheme = (typeof VS)[keyof typeof VS];

function TreeView({
  nodes,
  depth,
  collapsed,
  toggleDir,
  selectedFile,
  onSelectFile,
  v,
  displayPath,
}: {
  nodes: VfsNode[];
  depth: number;
  collapsed: Set<string>;
  toggleDir: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  v: VsTheme;
  displayPath: (p: string) => string;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = !collapsed.has(node.path);
        const isSelected = node.kind === "file" && selectedFile === node.path;
        const note = noteForPath(node.path);
        const isClickable = node.kind !== "symlink";

        return (
          <div key={node.path}>
            <div
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={`group flex h-[22px] items-center pr-2 ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              style={{
                paddingLeft: depth * 12 + 8,
                backgroundColor: isSelected ? `${v.accent}30` : undefined,
                color: v.text,
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = `${v.text}08`;
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
              onClick={() => {
                if (node.kind === "dir") toggleDir(node.path);
                else if (node.kind === "file") onSelectFile(node.path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (node.kind === "dir") toggleDir(node.path);
                  else if (node.kind === "file") onSelectFile(node.path);
                }
              }}
            >
              {/* Chevron */}
              {node.kind === "dir" ? (
                <span
                  className="mr-0.5 inline-flex w-3 shrink-0 items-center justify-center text-[7px]"
                  style={{ color: v.textDim }}
                >
                  {isExpanded ? "\u25BC" : "\u25B6"}
                </span>
              ) : (
                <span className="mr-0.5 inline-block w-3 shrink-0" />
              )}

              {/* File icon */}
              {node.kind === "file" && (
                <span
                  className="mr-1 shrink-0 text-[9px] font-bold"
                  style={{ color: fileIconColor(node.name), minWidth: 14, textAlign: "center" }}
                >
                  {fileIconLabel(node.name)}
                </span>
              )}

              {/* Name */}
              <span
                className="truncate text-[12px]"
                style={{
                  color:
                    node.kind === "dir"
                      ? v.folderName
                      : node.kind === "symlink"
                        ? v.purple
                        : v.text,
                  fontWeight: node.kind === "dir" ? 500 : 400,
                  fontStyle: node.kind === "symlink" ? "italic" : undefined,
                }}
              >
                {node.name}
              </span>

              {/* Symlink target */}
              {node.kind === "symlink" && (
                <span className="ml-1 truncate text-[9px]" style={{ color: v.textDim }}>
                  {"\u2192 "}
                  {node.symlinkTarget ? displayPath(node.symlinkTarget).replace(/^\//, "") : "?"}
                </span>
              )}

              {/* Version annotation */}
              {note && (
                <span className="ml-auto shrink-0 pl-2 text-[9px]" style={{ color: v.textDim }}>
                  {note}
                </span>
              )}
            </div>

            {/* Children */}
            {node.kind === "dir" && isExpanded && node.children && (
              <TreeView
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                toggleDir={toggleDir}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                v={v}
                displayPath={displayPath}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Small UI pieces ──────────────────────────────────────────────────

function WsTab({
  active,
  onClick,
  children,
  v,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  v: VsTheme;
}) {
  return (
    <button
      onClick={onClick}
      className="border-r px-3 text-[11px] font-medium transition-colors"
      style={{
        height: 35,
        color: active ? v.textBright : v.textDim,
        backgroundColor: active ? v.tabActiveBg : v.tabInactiveBg,
        borderColor: v.tabBorder,
        borderTop: active ? `1px solid ${v.accent}` : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function formatValue(val: unknown): string {
  if (typeof val === "string") return `"${val}"`;
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}
