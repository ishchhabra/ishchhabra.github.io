import type { FuncOpId } from "./FuncOp";
import type { PlaceId } from "./Place";

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
  /**
   * The {@link FuncOpId} of the FuncOp that lexically contains this
   * declaration. Used by the function inliner's visibility check:
   * walking `FuncOp.parentFuncOpId` gives a simple, LexicalScope-free
   * ancestry test for captured declarations.
   */
  funcOpId?: FuncOpId;
  bindingPlaceId?: PlaceId;
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
