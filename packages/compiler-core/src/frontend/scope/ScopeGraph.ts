import type { PrivateIdentifier } from "oxc-parser";

import type { PrivateName } from "../../ir/core/PrivateName";
import { BindingIdentifierNode, ScopeReferenceNode, ScopeOwnerNode } from "../ast/types";
import { Declaration } from "./Declaration";
import { Scope } from "./Scope";

/**
 * Scope analysis result for one parsed module.
 *
 * The graph records scopes for scope-owning syntax nodes and declaration
 * resolution for identifier references. IR lowering consumes this graph instead
 * of rediscovering bindings while emitting operations.
 */
export class ScopeGraph {
  readonly #scopesByOwner: WeakMap<ScopeOwnerNode, Scope> = new WeakMap();
  readonly #declarationsByBinding: WeakMap<BindingIdentifierNode, Declaration> = new WeakMap();
  readonly #declarationsByReference: WeakMap<ScopeReferenceNode, Declaration> = new WeakMap();
  readonly #globalReferences: WeakSet<ScopeReferenceNode> = new WeakSet();
  readonly #privateNames: WeakMap<PrivateIdentifier, PrivateName> = new WeakMap();
  readonly #capturesByScope: WeakMap<Scope, Declaration[]> = new WeakMap();

  constructor(public readonly programScope: Scope) {}

  /**
   * Records the scope associated with a scope-owning AST node.
   */
  public setScope(owner: ScopeOwnerNode, scope: Scope): void {
    this.#scopesByOwner.set(owner, scope);
  }

  /**
   * Returns the scope associated with a scope-owning AST node.
   */
  public scopeForOwner(owner: ScopeOwnerNode): Scope {
    const scope = this.#scopesByOwner.get(owner);
    if (scope === undefined) {
      throw new Error("No scope recorded for AST scope owner");
    }

    return scope;
  }

  /**
   * Records the declaration introduced by a binding identifier.
   */
  public bindDeclaration(binding: BindingIdentifierNode, declaration: Declaration): void {
    this.#declarationsByBinding.set(binding, declaration);
  }

  /**
   * Returns the declaration introduced by a binding identifier.
   */
  public declarationForBinding(binding: BindingIdentifierNode): Declaration {
    const declaration = this.#declarationsByBinding.get(binding);
    if (declaration === undefined) {
      throw new Error(`Binding ${binding.name} has no declaration`);
    }

    return declaration;
  }

  /**
   * Records the declaration resolved for an identifier reference.
   */
  public bindReference(reference: ScopeReferenceNode, declaration: Declaration): void {
    this.#declarationsByReference.set(reference, declaration);
  }

  /**
   * Records an identifier reference that resolves through host/global lookup.
   */
  public bindGlobalReference(reference: ScopeReferenceNode): void {
    this.#globalReferences.add(reference);
  }

  /**
   * Returns whether an identifier reference resolves through host/global lookup.
   */
  public isGlobalReference(reference: ScopeReferenceNode): boolean {
    return this.#globalReferences.has(reference);
  }

  /**
   * Returns the declaration resolved for an identifier reference.
   */
  public declarationForReference(reference: ScopeReferenceNode): Declaration {
    const declaration = this.#declarationsByReference.get(reference);
    if (declaration === undefined) {
      throw new Error(`Identifier ${reference.name} is not bound`);
    }

    return declaration;
  }

  /**
   * Records a declaration captured by a function scope.
   */
  public recordCapture(functionScope: Scope, declaration: Declaration): void {
    let captures = this.#capturesByScope.get(functionScope);
    if (captures === undefined) {
      captures = [];
      this.#capturesByScope.set(functionScope, captures);
    }

    if (!captures.includes(declaration)) {
      captures.push(declaration);
    }
  }

  /**
   * Returns declarations captured by a function scope.
   */
  public capturesForScope(scope: Scope): readonly Declaration[] {
    return this.#capturesByScope.get(scope) ?? [];
  }

  /**
   * Returns declarations captured by the function scope associated with an AST owner.
   */
  public capturesForOwner(owner: ScopeOwnerNode): readonly Declaration[] {
    return this.capturesForScope(this.scopeForOwner(owner));
  }

  /**
   * Records the private name denoted by a private identifier.
   */
  public bindPrivateName(identifier: PrivateIdentifier, privateName: PrivateName): void {
    this.#privateNames.set(identifier, privateName);
  }

  /**
   * Returns the private name denoted by a private identifier.
   */
  public privateNameFor(identifier: PrivateIdentifier): PrivateName {
    const privateName = this.#privateNames.get(identifier);
    if (privateName === undefined) {
      throw new Error(`Private name #${identifier.name} is not bound`);
    }

    return privateName;
  }
}
