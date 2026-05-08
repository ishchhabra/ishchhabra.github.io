import { Declaration } from "./Declaration";
import { Scope } from "./Scope";

/**
 * Declarations that must be instantiated before lowering a scope body.
 *
 * The arrays preserve ECMAScript declaration-instantiation order within each
 * category.
 */
export interface ScopeDeclarationInstantiation {
  readonly functions: readonly Declaration[];
  readonly vars: readonly Declaration[];
  readonly lexicals: readonly Declaration[];
}

interface MutableScopeDeclarationInstantiation {
  readonly functions: Declaration[];
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

  public addFunction(scope: Scope, declaration: Declaration): void {
    this.forScope(scope).functions.push(declaration);
  }

  public addVar(scope: Scope, declaration: Declaration): void {
    this.forScope(scope).vars.push(declaration);
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
