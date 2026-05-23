import type { Declaration } from "./Declaration";

export interface BindingSemantics {
  readonly mutable: boolean;
  readonly hasTDZ: boolean;
  readonly indirect: boolean;
  readonly preservesDeclarationAnchor: boolean;
}

export function bindingSemantics(declaration: Declaration): BindingSemantics {
  switch (declaration.kind) {
    case "var":
      return {
        mutable: true,
        hasTDZ: false,
        indirect: false,
        preservesDeclarationAnchor: false,
      };

    case "lexical":
      return {
        mutable: declaration.mode !== "const",
        hasTDZ: true,
        indirect: false,
        preservesDeclarationAnchor: declaration.mode === "class",
      };

    case "function":
      return {
        mutable: true,
        hasTDZ: declaration.scopeKind === "module" || declaration.scopeKind === "block",
        indirect: false,
        preservesDeclarationAnchor: true,
      };

    case "parameter":
      return {
        mutable: true,
        hasTDZ: false,
        indirect: false,
        preservesDeclarationAnchor: false,
      };

    case "import":
      return {
        mutable: false,
        hasTDZ: true,
        indirect: true,
        preservesDeclarationAnchor: true,
      };

    case "catch-parameter":
      return {
        mutable: true,
        hasTDZ: false,
        indirect: false,
        preservesDeclarationAnchor: false,
      };
  }
}

export function canPromoteBindingStorage(declaration: Declaration): boolean {
  const semantics = bindingSemantics(declaration);

  return (
    !semantics.indirect &&
    !semantics.preservesDeclarationAnchor &&
    declaration.kind !== "parameter" &&
    declaration.kind !== "catch-parameter"
  );
}
