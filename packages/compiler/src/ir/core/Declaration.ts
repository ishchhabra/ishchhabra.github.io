import type { FuncOpId } from "./FuncOp";
import type { ScopeId } from "./LexicalScope";
import type { Value } from "./Value";

export type DeclarationKind =
  | "var"
  | "let"
  | "const"
  | "class"
  | "function"
  | "param"
  | "import"
  | "catch";

export interface DeclarationMetadata {
  kind: DeclarationKind;
  sourceName: string;
  scopeId?: ScopeId;
  storage?: "local" | "context" | "module";
  import?: {
    source: string;
    imported: ImportName;
  };
  /**
   * The {@link FuncOpId} of the FuncOp that lexically contains this
   * declaration. Used by the function inliner's visibility check:
   * walking `FuncOp.parentFuncOpId` gives a simple, LexicalScope-free
   * ancestry test for captured declarations.
   */
  funcOpId?: FuncOpId;
  /** The {@link Value} codegen uses for the declaration's binding. */
  bindingValue?: Value;
}

export type ImportName =
  | { kind: "named"; name: string }
  | { kind: "default" }
  | { kind: "namespace" };

export function importNameToExportName(name: ImportName): string {
  switch (name.kind) {
    case "named":
      return name.name;
    case "default":
      return "default";
    case "namespace":
      return "*";
  }
}

export function getCodegenDeclarationKind(
  kind: DeclarationKind,
): "var" | "let" | "const" | undefined {
  switch (kind) {
    case "var":
    case "let":
    case "const":
      return kind;
    case "class":
      return "const";
    default:
      return undefined;
  }
}
