import type { DeclarationTable } from "../../frontend/declarations/DeclarationTable";
import type { DeclarationId, Value } from "../../ir/core/Value";

export class BindingNames {
  readonly #declarationNames = new Map<DeclarationId, string>();
  readonly #values = new Map<Value, string>();
  readonly #usedNames = new Set<string>();

  constructor(private readonly declarations: DeclarationTable) {}

  public declarationName(id: DeclarationId): string {
    let name = this.#declarationNames.get(id);
    if (name === undefined) {
      const declaration = this.declarations.get(id);
      name =
        declaration.kind === "import"
          ? this.reserveName(declaration.name, id)
          : this.reserveName(`$d${id}`, id);
      this.#declarationNames.set(id, name);
    }

    return name;
  }

  public valueName(value: Value): string {
    let name = this.#values.get(value);
    if (name === undefined) {
      name = this.reserveName(`$${value.id}`, value.id);
      this.#values.set(value, name);
    }

    return name;
  }

  private reserveName(baseName: string, id: number): string {
    if (!this.#usedNames.has(baseName)) {
      this.#usedNames.add(baseName);
      return baseName;
    }

    let suffix = id;
    let name = `${baseName}$${suffix}`;
    while (this.#usedNames.has(name)) {
      suffix++;
      name = `${baseName}$${suffix}`;
    }

    this.#usedNames.add(name);
    return name;
  }
}
