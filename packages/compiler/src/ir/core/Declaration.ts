import type { LexicalScopeId } from "./LexicalScope";
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
  scopeId?: LexicalScopeId;
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
