import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class DebuggerStatementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  // Five-axis effects: `debugger;` is externally observable (it
  // pauses execution under a debugger) but otherwise touches no
  // memory, doesn't throw, doesn't diverge, deterministic.
  public override getMemoryEffects(): import("../../memory/MemoryLocation").MemoryEffects {
    return { reads: [], writes: [] };
  }
  public override mayThrow(): boolean {
    return false;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return true;
  }

  public clone(ctx: CloneContext): DebuggerStatementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(DebuggerStatementOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  operands() {
    return [];
  }
}
