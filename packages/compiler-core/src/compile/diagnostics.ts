/**
 * Diagnostic reporting configuration.
 *
 * These options affect which diagnostics are returned to callers. They must not
 * change parsing, lowering, optimization, or emitted JavaScript.
 */
export interface DiagnosticOptions {
  /**
   * Lowest diagnostic severity included in the returned diagnostics.
   *
   * Defaults to `"info"`, which includes every diagnostic.
   */
  readonly minimumSeverity?: DiagnosticSeverity;
}

/**
 * Severity of a compiler diagnostic.
 *
 * Severity describes the impact of a diagnostic, not whether it is shown.
 * Filtering is controlled by {@link DiagnosticOptions.minimumSeverity}.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * Structured diagnostic produced by the compiler.
 *
 * Diagnostics are serializable data. CLI formatting, terminal colors, and UI
 * rendering should happen outside compiler core.
 */
export interface CompilerDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly location?: SourceLocation;
}

/**
 * One-based source location.
 */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

/**
 * Applies caller-requested diagnostic severity filtering.
 */
export function filterDiagnostics(
  diagnostics: readonly CompilerDiagnostic[],
  options: DiagnosticOptions | undefined,
): readonly CompilerDiagnostic[] {
  const minimum = options?.minimumSeverity ?? "info";

  return diagnostics.filter(
    (diagnostic) => severityRank(diagnostic.severity) <= severityRank(minimum),
  );
}

function severityRank(severity: DiagnosticSeverity): number {
  switch (severity) {
    case "error":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}
