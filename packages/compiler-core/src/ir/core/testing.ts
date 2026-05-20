import { BasicBlock, makeBlockId } from "./Block";
import { FunctionIR, makeFunctionId } from "./FunctionIR";
import { ModuleIR } from "./ModuleIR";
import { makeModuleId } from "./ModuleId";
import { Operation, makeOperationId, type OperationId } from "./Operation";
import { blockTarget, type BlockTarget, TerminatorOp } from "./TerminatorOp";
import { makeDeclarationId, makeValueId, Value, type DeclarationId } from "./Value";

export function value(id: number, declarationId: DeclarationId = makeDeclarationId(id)): Value {
  return new Value(makeValueId(id), declarationId);
}

export function block(id: number): BasicBlock {
  return new BasicBlock(makeBlockId(id));
}

export function moduleIR(id: number): ModuleIR {
  return new ModuleIR(makeModuleId(id));
}

export function functionIR(id: number, blocks = [block(id)]): FunctionIR {
  return new FunctionIR(makeFunctionId(id), {
    params: [],
    blocks,
  });
}

export class TestOp extends Operation {
  readonly #operands: readonly Value[];

  constructor(id: OperationId, operands: readonly Value[] = [], results: readonly Value[] = []) {
    super(id, results);
    this.#operands = operands;
  }

  override operands(): readonly Value[] {
    return this.#operands;
  }
}

export function testOp(
  id: number,
  operands: readonly Value[] = [],
  results: readonly Value[] = [],
): TestOp {
  return new TestOp(makeOperationId(id), operands, results);
}

export class TestTerminatorOp extends TerminatorOp {
  readonly #operands: readonly Value[];
  readonly #targets: readonly BlockTarget[];

  constructor(
    id: OperationId,
    targets: readonly BlockTarget[],
    operands: readonly Value[] = [],
    results: readonly Value[] = [],
  ) {
    super(id, results);
    this.#targets = targets;
    this.#operands = operands;
  }

  override operands(): readonly Value[] {
    return this.#operands;
  }

  override targetCount(): number {
    return this.#targets.length;
  }

  override target(index: number): BlockTarget {
    const target = this.#targets[index];
    if (target === undefined) {
      throw new Error(`Invalid target index ${index}`);
    }

    return target;
  }

  override withTarget(index: number, target: BlockTarget): TerminatorOp {
    if (index < 0 || index >= this.#targets.length) {
      throw new Error(`Invalid target index ${index}`);
    }

    const targets = [...this.#targets];
    targets[index] = target;

    return new TestTerminatorOp(this.id, targets, this.#operands, this.results);
  }
}

export function testTerminatorOp(
  id: number,
  targets: readonly BlockTarget[],
  operands: readonly Value[] = [],
  results: readonly Value[] = [],
): TestTerminatorOp {
  return new TestTerminatorOp(makeOperationId(id), targets, operands, results);
}
