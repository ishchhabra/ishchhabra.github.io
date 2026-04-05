import { useCallback, useRef, useState } from "react";
import { Lab } from "../components/lab/Lab";
import { Surface } from "../components/Surface";
import { compileCode } from "../routes/lab/js-aot-transpiler";

const DEFAULT_SOURCE = `const add = (a, b) => {
  return a + b;
};

const result = add(1, 2);
console.log(result);
`;

const STAGES = [
  { key: "output", label: "Output" },
  { key: "hir", label: "HIR" },
  { key: "ssa", label: "SSA" },
  { key: "optimized", label: "Optimized" },
  { key: "ssaEliminated", label: "SSA Eliminated" },
  { key: "lateOptimized", label: "Late Optimized" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

type Stages = Record<StageKey, string>;

const PASS_GROUPS = [
  {
    label: "Optimizer",
    key: "enableOptimizer",
    passes: [
      { key: "enableConstantPropagationPass", label: "Constant propagation" },
      { key: "enableAlgebraicSimplificationPass", label: "Algebraic simplification" },
      { key: "enableExpressionInliningPass", label: "Expression inlining" },
      { key: "enableFunctionInliningPass", label: "Function inlining" },
      { key: "enableDeadCodeEliminationPass", label: "Dead code elimination" },
      { key: "enablePhiOptimizationPass", label: "Phi optimization" },
    ],
  },
  {
    label: "Late optimizer",
    key: "enableLateOptimizer",
    passes: [
      { key: "enableLateConstantPropagationPass", label: "Constant propagation" },
      { key: "enableLateCopyPropagationPass", label: "Copy propagation" },
      { key: "enableLateCopyFoldingPass", label: "Copy folding" },
      { key: "enableLateCopyCoalescingPass", label: "Copy coalescing" },
      { key: "enableLateDeadCodeEliminationPass", label: "Dead code elimination" },
      {
        key: "enableScalarReplacementOfAggregatesPass",
        label: "Scalar replacement",
      },
      { key: "enableExportDeclarationMergingPass", label: "Export merging" },
    ],
  },
] as const;

type PassKey = (typeof PASS_GROUPS)[number]["passes"][number]["key"];
type GroupKey = (typeof PASS_GROUPS)[number]["key"];

export function CompilerPlayground() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [stages, setStages] = useState<Stages | null>(null);
  const [activeStage, setActiveStage] = useState<StageKey>("output");
  const [error, setError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [passes, setPasses] = useState<Record<string, boolean>>({});
  const [showPasses, setShowPasses] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    setError(null);
    try {
      const result = await compileCode({ data: { source, options: passes } });
      if (result.error) {
        setError(result.error);
        setStages(null);
      } else if (result.stages) {
        setStages(result.stages as Stages);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStages(null);
    } finally {
      setCompiling(false);
    }
  }, [source, passes]);

  const togglePass = (key: string) => {
    setPasses((prev) => ({ ...prev, [key]: prev[key] === false }));
  };

  const toggleGroup = (groupKey: GroupKey, passKeys: readonly { key: PassKey }[]) => {
    const groupEnabled = passes[groupKey] !== false;
    const newPasses = { ...passes, [groupKey]: !groupEnabled };
    for (const p of passKeys) {
      newPasses[p.key] = !groupEnabled;
    }
    setPasses(newPasses);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleCompile();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + "  " + value.substring(end);
      setSource(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  const activeContent = stages ? stages[activeStage] : null;

  return (
    <Lab.Layout slug="js-aot-transpiler">
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={handleCompile}
          disabled={compiling}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-600"
        >
          {compiling ? "Compiling..." : "Compile"}
        </button>
        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{"\u2318"}+Enter</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowPasses(!showPasses)}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {showPasses ? "Hide" : "Show"} passes
        </button>
      </div>

      {/* Pass toggles */}
      {showPasses && (
        <Surface variant="panel" className="mb-4 p-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {PASS_GROUPS.map((group) => (
              <div key={group.key}>
                <label className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={passes[group.key] !== false}
                    onChange={() => toggleGroup(group.key, group.passes)}
                    className="accent-violet-600"
                  />
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {group.label}
                  </span>
                </label>
                <div className="ml-5 space-y-1">
                  {group.passes.map((pass) => (
                    <label key={pass.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={passes[pass.key] !== false}
                        onChange={() => togglePass(pass.key)}
                        className="accent-violet-600"
                      />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{pass.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {/* Editor + Output */}
      <div className="grid min-h-[500px] grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Input */}
        <Surface variant="code" className="flex flex-col overflow-hidden">
          <div className="flex items-center border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
            <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
              input.js
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200 dark:placeholder:text-zinc-600"
            placeholder="Enter JavaScript code..."
          />
        </Surface>

        {/* Output */}
        <Surface variant="code" className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 px-2 dark:border-zinc-700">
            {STAGES.map((stage) => (
              <button
                key={stage.key}
                onClick={() => setActiveStage(stage.key)}
                className={`whitespace-nowrap px-3 py-2 font-mono text-xs font-medium transition-colors ${
                  activeStage === stage.key
                    ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
                    : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {error ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-red-500 dark:text-red-400">
                {error}
              </pre>
            ) : activeContent ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {activeContent}
              </pre>
            ) : (
              <p className="font-mono text-sm text-zinc-400 dark:text-zinc-600">
                Click Compile or press {"\u2318"}+Enter
              </p>
            )}
          </div>
        </Surface>
      </div>
    </Lab.Layout>
  );
}
