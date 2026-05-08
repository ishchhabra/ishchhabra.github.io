import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { compileSource } from "./compileSource";
import { filterDiagnostics, type CompilerDiagnostic, type DiagnosticOptions } from "./diagnostics";

/**
 * Options for compiling a source tree.
 */
export interface CompileProjectOptions {
  /**
   * Directory containing source files to compile.
   */
  readonly srcDir: string;

  /**
   * Directory where compiled source files are written.
   */
  readonly outDir: string;

  /**
   * Source files to copy instead of compile.
   *
   * Patterns are tested against paths relative to `srcDir`.
   */
  readonly exclude?: readonly RegExp[];

  /**
   * Controls diagnostic filtering and optional debug artifacts.
   */
  readonly diagnostics?: DiagnosticOptions;
}

/**
 * Result of compiling a source tree.
 */
export interface CompileProjectResult {
  /**
   * Result for each discovered input file.
   */
  readonly files: readonly CompileProjectFileResult[];

  /**
   * Diagnostics produced while compiling the project.
   */
  readonly diagnostics: readonly CompilerDiagnostic[];
}

/**
 * Result for one discovered input file.
 */
export type CompileProjectFileResult =
  | {
      readonly status: "compiled";
      readonly sourcePath: string;
      readonly outputPath: string;
    }
  | {
      readonly status: "copied";
      readonly sourcePath: string;
      readonly outputPath: string;
      readonly reason: CompileProjectCopyReason;
      readonly diagnosticCodes: readonly string[];
    };

/**
 * Why an input was copied instead of compiled.
 */
export type CompileProjectCopyReason = "asset" | "declaration" | "excluded" | "compile-error";

type ProjectInputKind = "source" | "asset" | "declaration";

interface ProjectInputFile {
  readonly kind: ProjectInputKind;
  readonly relativePath: string;
  readonly sourcePath: string;
  readonly outputPath: string;
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ASSET_EXTENSIONS = new Set([
  ".css",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
]);

/**
 * Compiles a source tree into an output tree.
 *
 * Unsupported source files are copied unchanged and reported as copied with a
 * diagnostic. This keeps build verification moving while making compiler gaps
 * visible to callers.
 */
export function compileProject(options: CompileProjectOptions): CompileProjectResult {
  const srcDir = resolve(options.srcDir);
  const outDir = resolve(options.outDir);
  const exclude = options.exclude ?? [];

  const files: CompileProjectFileResult[] = [];
  const diagnostics: CompilerDiagnostic[] = [];

  for (const input of discoverProjectInputs(srcDir, outDir)) {
    if (input.kind === "asset" || input.kind === "declaration") {
      copyInput(input);
      files.push({
        status: "copied",
        sourcePath: input.sourcePath,
        outputPath: input.outputPath,
        reason: input.kind,
        diagnosticCodes: [],
      });
      continue;
    }

    if (exclude.some((pattern) => pattern.test(input.relativePath))) {
      copyInput(input);
      files.push({
        status: "copied",
        sourcePath: input.sourcePath,
        outputPath: input.outputPath,
        reason: "excluded",
        diagnosticCodes: [],
      });
      continue;
    }

    const source = readFileSync(input.sourcePath, "utf8");

    try {
      const result = compileSource(source, {
        sourceName: input.sourcePath,
        diagnostics: options.diagnostics,
      });

      mkdirSync(dirname(input.outputPath), { recursive: true });
      writeFileSync(input.outputPath, result.code);
      diagnostics.push(...result.diagnostics);

      files.push({
        status: "compiled",
        sourcePath: input.sourcePath,
        outputPath: input.outputPath,
      });
    } catch (error) {
      const diagnostic = compileErrorDiagnostic(input.sourcePath, error);
      diagnostics.push(diagnostic);
      copyInput(input);

      files.push({
        status: "copied",
        sourcePath: input.sourcePath,
        outputPath: input.outputPath,
        reason: "compile-error",
        diagnosticCodes: [diagnostic.code],
      });
    }
  }

  return {
    files,
    diagnostics: filterDiagnostics(diagnostics, options.diagnostics),
  };
}

function discoverProjectInputs(srcDir: string, outDir: string): ProjectInputFile[] {
  return walkFiles(srcDir).flatMap((sourcePath) => {
    const kind = inputKind(sourcePath);
    if (kind === null) return [];

    const relativePath = relative(srcDir, sourcePath);
    return [
      {
        kind,
        relativePath,
        sourcePath,
        outputPath: join(outDir, relativePath),
      },
    ];
  });
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function inputKind(path: string): ProjectInputKind | null {
  if (path.endsWith(".d.ts") || path.endsWith(".d.tsx")) {
    return "declaration";
  }

  const extension = extname(path);
  if (SOURCE_EXTENSIONS.has(extension)) return "source";
  if (ASSET_EXTENSIONS.has(extension)) return "asset";
  return null;
}

function copyInput(input: ProjectInputFile): void {
  mkdirSync(dirname(input.outputPath), { recursive: true });
  copyFileSync(input.sourcePath, input.outputPath);
}

function compileErrorDiagnostic(sourcePath: string, error: unknown): CompilerDiagnostic {
  return {
    severity: "error",
    code: "compile.file.failed",
    message: error instanceof Error ? error.message : String(error),
    sourcePath,
  };
}
