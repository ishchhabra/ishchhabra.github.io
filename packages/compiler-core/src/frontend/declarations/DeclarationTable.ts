import { DeclarationId, Value } from "../../ir/core/Value";
import { Declaration } from "../scope/Declaration";

/**
 * Metadata table for source-level declarations.
 *
 * The table indexes declarations by stable declaration id and optionally stores
 * the canonical binding value allocated for each declaration during lowering.
 * It does not track current SSA versions or control-flow specific values.
 */
export class DeclarationTable {
  readonly #declarations: Map<DeclarationId, Declaration> = new Map();
  readonly #bindingValues: Map<DeclarationId, Value> = new Map();

  /**
   * Registers a source declaration.
   */
  public add(declaration: Declaration): void {
    if (this.#declarations.has(declaration.id)) {
      throw new Error(`Declaration#${declaration.id} is already registered`);
    }

    this.#declarations.set(declaration.id, declaration);
  }

  /**
   * Returns a registered source declaration.
   */
  public get(id: DeclarationId): Declaration {
    const declaration = this.#declarations.get(id);
    if (declaration === undefined) {
      throw new Error(`Declaration#${id} is not registered`);
    }

    return declaration;
  }

  /**
   * Returns whether a declaration id has been registered.
   */
  public has(id: DeclarationId): boolean {
    return this.#declarations.has(id);
  }

  /**
   * Records the canonical binding value for a declaration.
   *
   * This is the stable storage identity used by lowering/codegen. It is not the
   * latest SSA value assigned to the declaration.
   */
  public setBindingValue(id: DeclarationId, value: Value): void {
    this.get(id);

    if (this.#bindingValues.has(id)) {
      throw new Error(`Declaration#${id} already has a binding value`);
    }

    this.#bindingValues.set(id, value);
  }

  /**
   * Returns the canonical binding value for a declaration.
   */
  public bindingValue(id: DeclarationId): Value {
    this.get(id);

    const value = this.#bindingValues.get(id);
    if (value === undefined) {
      throw new Error(`Declaration#${id} has no binding value`);
    }

    return value;
  }

  /**
   * Returns whether a canonical binding value has been recorded.
   */
  public hasBindingValue(id: DeclarationId): boolean {
    this.get(id);
    return this.#bindingValues.has(id);
  }
}
