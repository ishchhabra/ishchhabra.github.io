import type { PrivateName } from "../../ir/core/PrivateName";
import { Declaration } from "./Declaration";

export type ScopeKind = "module" | "function" | "block" | "catch";

/**
 * Lexical environment created by ECMAScript scope analysis.
 *
 * Scopes own source declarations and link to their lexical parent. Scope
 * analysis creates these scopes before IR lowering so lowering does not
 * rediscover hoisting, shadowing, or TDZ rules on the fly.
 */
export class Scope {
  readonly #declarations: Map<string, Declaration> = new Map();
  readonly #privateNames: Map<string, PrivateName> = new Map();

  constructor(
    public readonly kind: ScopeKind,
    public readonly parent: Scope | null,
  ) {}

  /**
   * Declarations directly owned by this scope.
   */
  public get declarations(): ReadonlyArray<Declaration> {
    return Array.from(this.#declarations.values());
  }

  /**
   * Adds a declaration directly to this scope.
   */
  public add(declaration: Declaration): void {
    if (this.#declarations.has(declaration.name)) {
      throw new Error(`Duplicate declaration: ${declaration.name}`);
    }

    this.#declarations.set(declaration.name, declaration);
  }

  /**
   * Looks up a declaration directly owned by this scope.
   */
  public getLocal(name: string): Declaration | undefined {
    return this.#declarations.get(name);
  }

  /**
   * Resolves a declaration named `name` by searching this scope and its parents.
   * Returns the Declaration if found, or undefined if not found.
   */
  public resolve(name: string): Declaration | undefined {
    const local = this.getLocal(name);
    if (local !== undefined) return local;

    return this.parent?.resolve(name);
  }

  /**
   * Resolves a declaration through this scope's lexical parent chain.
   */
  public lookup(name: string): Declaration {
    const declaration = this.resolve(name);
    if (declaration !== undefined) return declaration;

    throw new Error(`Unresolved binding: ${name}`);
  }

  /**
   * Adds a private name directly to this scope.
   */
  public addPrivateName(privateName: PrivateName): void {
    if (this.#privateNames.has(privateName.name)) {
      throw new Error(`Duplicate private name: #${privateName.name}`);
    }

    this.#privateNames.set(privateName.name, privateName);
  }

  /**
   * Resolves a private name through this scope's lexical parent chain.
   */
  public resolvePrivateName(name: string): PrivateName | undefined {
    return this.#privateNames.get(name) ?? this.parent?.resolvePrivateName(name);
  }
}
