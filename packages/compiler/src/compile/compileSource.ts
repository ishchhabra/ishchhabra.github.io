import {
  filterDiagnostics,
  type CompilerDiagnostic,
  type DiagnosticOptions,
} from "./diagnostics";
import { parseModule } from "../frontend/parse/parseModule";
import { ModuleIRBuilder } from "../frontend/ModuleIRBuilder";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { generateJavaScript } from "../backend/js/generateJavaScript";
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
  const optimizedResult = runCompilerPasses(buildResult, ids);
  const code = generateJavaScript(optimizedResult);

  return {
    code,
    diagnostics: filterDiagnostics(diagnostics, options.diagnostics),
  };
}
