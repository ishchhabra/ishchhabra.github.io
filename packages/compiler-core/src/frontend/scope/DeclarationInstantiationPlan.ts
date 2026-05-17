import type { Function as OxcFunction } from "oxc-parser";

import { Declaration, type FunctionDeclaration } from "./Declaration";
import { Scope } from "./Scope";

export interface FunctionDeclarationInstantiation {
  readonly declaration: Declaration;
  readonly functionKind: FunctionDeclaration["functionKind"];
  readonly node: OxcFunction;
}

/**
 * Declarations that must be instantiated before lowering a scope body.
 *
 * The arrays preserve ECMAScript declaration-instantiation order within each
 * category.
 */
export interface ScopeDeclarationInstantiation {
  readonly functions: readonly FunctionDeclarationInstantiation[];
  readonly vars: readonly Declaration[];
  readonly lexicals: readonly Declaration[];
}

interface MutableScopeDeclarationInstantiation {
  readonly functions: FunctionDeclarationInstantiation[];
  readonly vars: Declaration[];
  readonly lexicals: Declaration[];
}

/**
 * ECMAScript declaration-instantiation work recorded per scope.
 *
 * This preserves hoisting and initialization order for IR lowering without
 * making `Scope` carry lowering state.
 */
export class DeclarationInstantiationPlan {
  readonly #scopes: Map<Scope, MutableScopeDeclarationInstantiation> = new Map();

  public addFunction(scope: Scope, instantiation: FunctionDeclarationInstantiation): void {
    const declarations = this.forScope(scope);
    const existingFunctionIndex = declarations.functions.findIndex(
      (existing) => existing.declaration.id === instantiation.declaration.id,
    );
    if (existingFunctionIndex !== -1) {
      declarations.functions.splice(existingFunctionIndex, 1);
    }

    const existingVarIndex = declarations.vars.findIndex(
      (existing) => existing.id === instantiation.declaration.id,
    );
    if (existingVarIndex !== -1) {
      declarations.vars.splice(existingVarIndex, 1);
    }

    declarations.functions.push(instantiation);
  }

  public addVar(scope: Scope, declaration: Declaration): void {
    const declarations = this.forScope(scope);
    if (
      declarations.vars.some((existing) => existing.id === declaration.id) ||
      declarations.functions.some((existing) => existing.declaration.id === declaration.id)
    ) {
      return;
    }

    declarations.vars.push(declaration);
  }

  public addLexical(scope: Scope, declaration: Declaration): void {
    this.forScope(scope).lexicals.push(declaration);
  }

  public declarationsForScope(scope: Scope): ScopeDeclarationInstantiation {
    const declarations = this.#scopes.get(scope);

    return {
      functions: declarations?.functions ?? [],
      vars: declarations?.vars ?? [],
      lexicals: declarations?.lexicals ?? [],
    };
  }

  private forScope(scope: Scope): MutableScopeDeclarationInstantiation {
    let declarations = this.#scopes.get(scope);
    if (declarations === undefined) {
      declarations = {
        functions: [],
        vars: [],
        lexicals: [],
      };
      this.#scopes.set(scope, declarations);
    }

    return declarations;
  }
}
