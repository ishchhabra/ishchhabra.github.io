import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { effects, UnknownLocation, type MemoryEffects } from "../../memory/MemoryLocation";
/**
 * Represents a memory instruction that loads a value for a global variable to a place.
 *
 * For example, when `console.log` is referenced, its value needs to be loaded from the global scope
 * before it can be used.
 */
export class LoadGlobalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly name: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadGlobalOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LoadGlobalOp, place, this.name);
  }

  rewrite(): Operation {
    // LoadGlobal can not be rewritten.
    return this;
  }

  getOperands(): Value[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    // LoadGlobal reads an unspecified external cell. A later
    // refinement (when we hook up ModuleSummary to the walker) can
    // narrow this to a specific ExportedBinding; for now, "reads
    // unknown" is sound and simple.
    return effects([UnknownLocation], []);
  }

  public override print(): string {
    return `${this.place.print()} = LoadGlobal ${this.name}`;
  }
}
