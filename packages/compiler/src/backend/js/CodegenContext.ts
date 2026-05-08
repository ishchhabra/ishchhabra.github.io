import type { ModuleIRBuildResult } from "../../frontend/ModuleIRBuilder";
import type { Declaration } from "../../frontend/scope/Declaration";
import type { BasicBlock } from "../../ir/core/Block";
import type { DeclarationId, Value } from "../../ir/core/Value";
import { identifier, type ESTreeExpression } from "./ast";
import { BindingNames } from "./BindingNames";

export class CodegenContext {
  readonly #fallthroughBlocks: BasicBlock[] = [];

  public readonly values = new Map<Value, ESTreeExpression>();
  public readonly declaredDeclarations = new Set<DeclarationId>();
  public readonly names: BindingNames;

  constructor(public readonly input: ModuleIRBuildResult) {
    this.names = new BindingNames(input.declarations);
  }

  public declaration(id: DeclarationId): Declaration {
    return this.input.declarations.get(id);
  }

  public pushFallthrough(block: BasicBlock): void {
    this.#fallthroughBlocks.push(block);
  }

  public popFallthrough(block: BasicBlock): void {
    const popped = this.#fallthroughBlocks.pop();
    if (popped !== block) {
      throw new Error(
        `Codegen fallthrough stack corrupted: expected bb${block.id}, got ${
          popped === undefined ? "empty stack" : `bb${popped.id}`
        }`,
      );
    }
  }

  public isFallthrough(block: BasicBlock): boolean {
    return this.#fallthroughBlocks.includes(block);
  }

  public expressionForValue(value: Value): ESTreeExpression {
    const expression = this.values.get(value);
    if (expression !== undefined) return expression;

    return identifier(this.names.valueName(value));
  }
}
