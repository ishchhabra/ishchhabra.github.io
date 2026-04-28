import {
  AssignmentExpressionOp,
  type AssignmentOperator,
  type AssignmentTarget,
  BinaryExpressionOp,
  type BinaryOperator,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  Operation,
  StoreContextOp,
  StoreDynamicPropertyOp,
  StoreLocalOp,
  StoreStaticPropertyOp,
  type Value,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { AliasOracle } from "../../../ir/memory/AliasOracle";
import {
  computedPropertyLocation,
  contextLocation,
  localLocation,
  staticPropertyLocation,
  type MemoryLocation,
} from "../../../ir/memory/MemoryLocation";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

type AssignmentStore =
  | StoreLocalOp
  | StoreContextOp
  | StoreStaticPropertyOp
  | StoreDynamicPropertyOp;

interface CompoundAssignmentMatch {
  readonly store: AssignmentStore;
  readonly binary: BinaryExpressionOp;
  readonly operator: AssignmentOperator;
  readonly target: AssignmentTarget;
  readonly oldValue: Value;
  readonly rhs: Value;
}

export class AssignmentExpressionReconstitutionPass extends FunctionPassBase {
  private readonly aliasOracle = new AliasOracle(this.funcOp.moduleIR.environment);

  protected step(): PassResult {
    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const store = block.operations[i];
        if (!isAssignmentStore(store)) continue;

        const match = this.matchCompoundAssignment(store);
        if (match === undefined) continue;

        this.reconstituteCompoundAssignment(block, store, match);
        return { changed: true };
      }
    }
    return { changed: false };
  }

  private matchCompoundAssignment(store: AssignmentStore): CompoundAssignmentMatch | undefined {
    const target = targetForStore(store);
    if (target === undefined) return undefined;

    const binary = store.value.def;
    if (!(binary instanceof BinaryExpressionOp)) return undefined;
    if (binary.parentBlock !== store.parentBlock) return undefined;

    const operator = assignmentOperatorFor(binary.operator);
    if (operator === undefined) return undefined;

    if (!this.matchesTargetRead(binary.left, target)) return undefined;
    if (!this.preservesOldReadUntilStore(store, binary, target)) return undefined;

    return {
      store,
      binary,
      operator,
      target,
      oldValue: binary.left,
      rhs: binary.right,
    };
  }

  private reconstituteCompoundAssignment(
    block: BasicBlock,
    store: AssignmentStore,
    match: CompoundAssignmentMatch,
  ): void {
    const assignment = this.funcOp.moduleIR.environment.createOperation(
      AssignmentExpressionOp,
      match.binary.place,
      match.operator,
      match.target,
      match.rhs,
    );

    block.replaceOp(store, assignment);

    const binaryIndex = block.operations.indexOf(match.binary);
    if (binaryIndex >= 0) {
      block.removeOpAt(binaryIndex);
    }

    this.removeDeadTargetRead(block, match.oldValue);
  }

  private matchesTargetRead(value: Value, target: AssignmentTarget): boolean {
    switch (target.kind) {
      case "local":
        return matchesLocalRead(value, target.binding, LoadLocalOp);
      case "context":
        return matchesLocalRead(value, target.binding, LoadContextOp);
      case "static-property": {
        const def = value.def;
        return (
          def instanceof LoadStaticPropertyOp &&
          def.object === target.object &&
          def.property === target.property
        );
      }
      case "dynamic-property": {
        const def = value.def;
        return (
          def instanceof LoadDynamicPropertyOp &&
          def.object === target.object &&
          def.property === target.property
        );
      }
    }
  }

  private preservesOldReadUntilStore(
    store: AssignmentStore,
    binary: BinaryExpressionOp,
    target: AssignmentTarget,
  ): boolean {
    const block = store.parentBlock;
    if (block === null || binary.parentBlock !== block) return false;

    const storeIndex = block.operations.indexOf(store);
    const binaryIndex = block.operations.indexOf(binary);
    if (storeIndex < 0 || binaryIndex < 0 || binaryIndex >= storeIndex) return false;

    const oldReadDef = binary.left.def;
    const oldReadIndex =
      oldReadDef instanceof Operation && oldReadDef.parentBlock === block
        ? block.operations.indexOf(oldReadDef)
        : binaryIndex;
    if (oldReadIndex < 0 || oldReadIndex >= storeIndex) return false;

    const rhsDependencies = this.collectDependencies(binary.right);
    const targetLocation = locationForTarget(target);

    for (let i = oldReadIndex + 1; i < storeIndex; i++) {
      const op = block.operations[i];
      if (op === binary || rhsDependencies.has(op)) continue;
      if (!this.canMoveTargetReadPast(op, target, targetLocation)) return false;
    }
    return true;
  }

  private canMoveTargetReadPast(
    op: Operation,
    target: AssignmentTarget,
    targetLocation: MemoryLocation,
  ): boolean {
    if (isPropertyTarget(target)) return isPureInterveningOp(op);
    if (this.aliasOracle.mayWrite(op, targetLocation)) return false;
    return !this.aliasOracle.isControlBarrier(op);
  }

  private collectDependencies(value: Value): Set<Operation> {
    const deps = new Set<Operation>();
    const stack = [value];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const def = current.def;
      if (!(def instanceof Operation) || deps.has(def)) continue;
      deps.add(def);
      for (const operand of def.operands()) {
        stack.push(operand);
      }
    }
    return deps;
  }

  private removeDeadTargetRead(block: BasicBlock, value: Value): void {
    const def = value.def;
    if (!(def instanceof Operation)) return;
    if (def.parentBlock !== block) return;
    if (def.place === undefined || def.place.users.size !== 0) return;

    const index = block.operations.indexOf(def);
    if (index >= 0) {
      block.removeOpAt(index);
    }
  }
}

function isAssignmentStore(op: Operation): op is AssignmentStore {
  return (
    op instanceof StoreLocalOp ||
    op instanceof StoreContextOp ||
    op instanceof StoreStaticPropertyOp ||
    op instanceof StoreDynamicPropertyOp
  );
}

function targetForStore(store: AssignmentStore): AssignmentTarget | undefined {
  if (store instanceof StoreLocalOp) {
    if (store.bindings.length > 0) return undefined;
    return { kind: "local", binding: store.binding };
  }
  if (store instanceof StoreContextOp) {
    if (store.kind !== "assignment" || store.bindings.length > 0) return undefined;
    return { kind: "context", binding: store.lval };
  }
  if (store instanceof StoreStaticPropertyOp) {
    return { kind: "static-property", object: store.object, property: store.property };
  }
  return { kind: "dynamic-property", object: store.object, property: store.property };
}

function assignmentOperatorFor(operator: BinaryOperator): AssignmentOperator | undefined {
  switch (operator) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**":
    case "<<":
    case ">>":
    case ">>>":
    case "|":
    case "^":
    case "&":
      return `${operator}=`;
    default:
      return undefined;
  }
}

function matchesLocalRead(
  value: Value,
  binding: Value,
  loadCtor: typeof LoadLocalOp | typeof LoadContextOp,
): boolean {
  if (value === binding) return true;
  if (value.declarationId === binding.declarationId && value.def === undefined) return true;
  const def = value.def;
  return def instanceof loadCtor && def.value.declarationId === binding.declarationId;
}

function locationForTarget(target: AssignmentTarget): MemoryLocation {
  switch (target.kind) {
    case "local":
      return localLocation(target.binding.declarationId);
    case "context":
      return contextLocation(target.binding.declarationId);
    case "static-property":
      return staticPropertyLocation(target.object, target.property);
    case "dynamic-property":
      return computedPropertyLocation(target.object);
  }
}

function isPropertyTarget(target: AssignmentTarget): boolean {
  return target.kind === "static-property" || target.kind === "dynamic-property";
}

function isPureInterveningOp(op: Operation): boolean {
  const effects = op.getMemoryEffects();
  return (
    effects.reads.length === 0 &&
    effects.writes.length === 0 &&
    !op.mayThrow() &&
    !op.mayDiverge() &&
    !op.isObservable()
  );
}
