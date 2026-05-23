import { generateJavaScript } from "../backend/js/generateJavaScript";
import { ModuleIRBuilder } from "../frontend/ModuleIRBuilder";
import { parseModule } from "../frontend/parse/parseModule";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { CompilerObserver } from "./CompilerObserver";
import { filterDiagnostics, type CompilerDiagnostic, type DiagnosticOptions } from "./diagnostics";
import { runCompilerPasses } from "./runCompilerPasses";

/**
 * Options for compiling a source string.
 */
export interface CompileSourceOptions {
  /**
   * Logical filename used for diagnostics and module syntax decisions.
   */
  readonly sourceName?: string;

  /**
   * Controls diagnostic filtering and optional debug artifacts.
   */
  readonly diagnostics?: DiagnosticOptions;

  /**
   * Receives compiler stage, pass, and output events for tooling/debug UIs.
   */
  readonly observer?: CompilerObserver;
}

/**
 * Result of compiling one source string.
 */
export interface CompileSourceResult {
  readonly code: string;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

/**
 * Compiles a source string to JavaScript.
 */
export function compileSource(
  source: string,
  options: CompileSourceOptions = {},
): CompileSourceResult {
  const sourceName = options.sourceName ?? "input.js";
  const diagnostics: CompilerDiagnostic[] = [];

  const program = parseModule(sourceName, source);
  const ids = new IRIdAllocator();
  const buildResult = new ModuleIRBuilder({ ids }).build(program);
  options.observer?.onStage?.({ stage: "hir", moduleIR: buildResult.moduleIR });

  const optimizedResult = runCompilerPasses(buildResult, ids, { observer: options.observer });
  const code = generateJavaScript(optimizedResult);
  options.observer?.onOutput?.({ code });

  return {
    code,
    diagnostics: filterDiagnostics(diagnostics, options.diagnostics),
  };
}
