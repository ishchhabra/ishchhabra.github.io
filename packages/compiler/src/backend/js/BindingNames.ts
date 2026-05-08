import type { DeclarationTable } from "../../frontend/declarations/DeclarationTable";
import type { DeclarationId, Value } from "../../ir/core/Value";

export class BindingNames {
  readonly #values = new Map<Value, string>();

  constructor(private readonly declarations: DeclarationTable) {}

  public declarationName(id: DeclarationId): string {
    return this.declarations.get(id).name;
  }

  public valueName(value: Value): string {
    let name = this.#values.get(value);
    if (name === undefined) {
      name = `$${value.id}`;
      this.#values.set(value, name);
    }

    return name;
  }
}
