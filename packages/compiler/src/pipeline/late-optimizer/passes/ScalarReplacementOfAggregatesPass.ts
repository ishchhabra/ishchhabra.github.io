import { Environment } from "../../../environment";
import {
  BasicBlock,
  ArrayDestructureOp,
  ArrayExpressionOp,
  BindingDeclOp,
  BindingInitOp,
  CallExpressionOp,
  LiteralOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  ObjectDestructureOp,
  ObjectExpressionOp,
  ObjectPropertyOp,
  StoreLocalOp,
  UnaryExpressionOp,
  Value,
  ValueId,
  type DestructureTarget,
} from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { SpreadElementOp } from "../../../ir/ops/prim/SpreadElement";
import { StoreDynamicPropertyOp } from "../../../ir/ops/prop/StoreDynamicProperty";
import { StoreStaticPropertyOp } from "../../../ir/ops/prop/StoreStaticProperty";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import { EscapeAnalysis, EscapeAnalysisResult } from "../../analysis/EscapeAnalysis";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

type ObjectShape = {
  readonly object: ObjectExpressionOp;
  readonly fields: ReadonlyMap<string, Value>;
};

type ArrayShape = {
  readonly array: ArrayExpressionOp;
  readonly elements: readonly Value[];
};

type AggregateShape =
  | {
      readonly kind: "object";
      readonly fields: ReadonlyMap<string, Value>;
    }
  | {
      readonly kind: "array";
      readonly elements: readonly Value[];
    };

type ScalarBinding = {
  readonly lval: Value;
  readonly value: Value;
};

type ScalarizableDestructure = ObjectDestructureOp | ArrayDestructureOp;

/**
 * Replaces provably local aggregate operations with scalar values.
 *
 * The pass is intentionally split into small transforms over a shared
 * aggregate view:
 *
 * - destructuring scalarization for literal object and array patterns,
 * - field-load forwarding for non-escaping object literals,
 * - intra-block field store/load forwarding,
 * - dead property-load removal for local literals.
 */
export class ScalarReplacementOfAggregatesPass extends FunctionPassBase {
  constructor(
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
  }

  protected step(): PassResult {
    const escape = this.AM.get(EscapeAnalysis, this.funcOp);
    const aggregates = new AggregateFacts(this.funcOp, escape);

    let changed = false;
    changed = this.scalarizeObjectDestructures(aggregates) || changed;
    changed = this.scalarizeArrayDestructures(aggregates) || changed;
    changed = this.forwardObjectFieldLoads(aggregates) || changed;
    changed = this.forwardInBlockObjectStores(aggregates) || changed;
    changed = this.removeDeadPropertyLoads(aggregates) || changed;

    return { changed };
  }

  private scalarizeObjectDestructures(aggregates: AggregateFacts): boolean {
    let changed = false;

    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];
        if (!(op instanceof ObjectDestructureOp)) continue;

        const shape = aggregates.aggregateShapeFor(op.value);
        if (shape === null) continue;
        const replacements = matchDestructureTarget(
          { kind: "object", properties: op.properties },
          shape,
          aggregates,
        );
        if (replacements === null) continue;

        block.removeOpAt(i);
        for (let j = 0; j < replacements.length; j++) {
          block.insertOpAt(i + j, this.createScalarBinding(op, replacements[j]));
        }
        i += replacements.length - 1;
        changed = true;
      }
    }

    return changed;
  }

  private scalarizeArrayDestructures(aggregates: AggregateFacts): boolean {
    let changed = false;

    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];
        if (!(op instanceof ArrayDestructureOp)) continue;

        const shape = aggregates.aggregateShapeFor(op.value);
        if (shape === null) continue;
        const replacements = matchDestructureTarget(
          { kind: "array", elements: op.elements },
          shape,
          aggregates,
        );
        if (replacements === null) continue;

        block.removeOpAt(i);
        for (let j = 0; j < replacements.length; j++) {
          block.insertOpAt(i + j, this.createScalarBinding(op, replacements[j]));
        }
        i += replacements.length - 1;
        changed = true;
      }
    }

    return changed;
  }

  private forwardObjectFieldLoads(aggregates: AggregateFacts): boolean {
    const candidates = aggregates.nonEscapingObjectShapes();
    if (candidates.size === 0) return false;

    this.removeObjectsWithWrites(candidates, aggregates);
    if (candidates.size === 0) return false;

    const replacement = new ReplacementPlan();
    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];
        if (!(op instanceof LoadStaticPropertyOp)) continue;
        if (isUsedAsCallCallee(op)) continue;

        const shape = aggregates.objectShapeFor(op.object);
        if (shape === null || !candidates.has(shape.object.place.id)) continue;

        const value = shape.fields.get(op.property);
        if (value === undefined) continue;
        replacement.replaceAndRemove(block, i, op.place, value);
      }
    }

    return replacement.apply();
  }

  private forwardInBlockObjectStores(aggregates: AggregateFacts): boolean {
    const replacement = new ReplacementPlan();

    for (const block of this.funcOp.blocks) {
      const state = new Map<ValueId, Map<string, Value>>();

      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];

        if (op instanceof ObjectExpressionOp) {
          const shape = aggregates.objectShapeFor(op.place);
          if (shape !== null && aggregates.doesNotEscape(op.place)) {
            state.set(op.place.id, new Map(shape.fields));
          }
          continue;
        }

        if (op instanceof StoreStaticPropertyOp) {
          const objectId = aggregates.objectIdFor(op.object);
          const fields = objectId === null ? undefined : state.get(objectId);
          fields?.set(op.property, op.value);
          continue;
        }

        if (op instanceof StoreDynamicPropertyOp) {
          const objectId = aggregates.objectIdFor(op.object);
          if (objectId !== null) state.delete(objectId);
          continue;
        }

        if (op instanceof UnaryExpressionOp && op.operator === "delete") {
          this.invalidateDeleteTarget(op, state, aggregates);
          continue;
        }

        if (op instanceof LoadStaticPropertyOp) {
          if (isUsedAsCallCallee(op) || feedsDeleteExpression(op)) continue;
          const objectId = aggregates.objectIdFor(op.object);
          const fields = objectId === null ? undefined : state.get(objectId);
          const value = fields?.get(op.property);
          if (value !== undefined) {
            replacement.replaceAndRemove(block, i, op.place, value);
          }
        }
      }
    }

    return replacement.apply();
  }

  private removeDeadPropertyLoads(aggregates: AggregateFacts): boolean {
    const removal = new RemovalPlan();

    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];
        if (!(op instanceof LoadStaticPropertyOp) && !(op instanceof LoadDynamicPropertyOp)) {
          continue;
        }
        if (op.place.users.size > 0) continue;
        if (!aggregates.isNonEscapingObjectLiteral(op.object)) continue;
        removal.remove(block, i);
      }
    }

    return removal.apply();
  }

  private invalidateDeleteTarget(
    op: UnaryExpressionOp,
    state: Map<ValueId, Map<string, Value>>,
    aggregates: AggregateFacts,
  ): void {
    const load = op.argument.def;
    if (!(load instanceof LoadStaticPropertyOp)) return;
    const objectId = aggregates.objectIdFor(load.object);
    const fields = objectId === null ? undefined : state.get(objectId);
    fields?.delete(load.property);
  }

  private removeObjectsWithWrites(
    candidates: Map<ValueId, ObjectShape>,
    aggregates: AggregateFacts,
  ): void {
    for (const block of this.funcOp.blocks) {
      for (const op of block.operations) {
        if (op instanceof StoreStaticPropertyOp || op instanceof StoreDynamicPropertyOp) {
          const objectId = aggregates.objectIdFor(op.object);
          if (objectId !== null) candidates.delete(objectId);
          continue;
        }

        if (op instanceof UnaryExpressionOp && op.operator === "delete") {
          const load = op.argument.def;
          if (!(load instanceof LoadStaticPropertyOp)) continue;
          const objectId = aggregates.objectIdFor(load.object);
          if (objectId !== null) candidates.delete(objectId);
        }
      }
    }
  }

  private createScalarBinding(
    source: ScalarizableDestructure,
    binding: ScalarBinding,
  ): BindingInitOp | StoreLocalOp {
    if (source.kind === "declaration") {
      return this.environment.createOperation(
        BindingInitOp,
        binding.lval,
        source.declarationKind ?? "const",
        binding.value,
      );
    }

    return this.environment.createOperation(
      StoreLocalOp,
      this.environment.createValue(),
      binding.lval,
      binding.value,
      [],
      this.findBindingCell(binding.lval) ?? binding.lval,
    );
  }

  private findBindingCell(lval: Value): Value | undefined {
    const declarationId = lval.originalDeclarationId ?? lval.declarationId;

    for (const block of this.funcOp.blocks) {
      for (const op of block.operations) {
        if (!(op instanceof BindingDeclOp) && !(op instanceof BindingInitOp)) continue;
        const opDeclarationId = op.place.originalDeclarationId ?? op.place.declarationId;
        if (opDeclarationId === declarationId) return op.place;
      }
    }

    return this.environment.getDeclarationBinding(declarationId);
  }
}

class AggregateFacts {
  private readonly objectShapeCache = new Map<ValueId, ObjectShape | null>();
  private readonly arrayShapeCache = new Map<ValueId, ArrayShape | null>();

  constructor(
    private readonly funcOp: FuncOp,
    private readonly escape: EscapeAnalysisResult,
  ) {}

  nonEscapingObjectShapes(): Map<ValueId, ObjectShape> {
    const result = new Map<ValueId, ObjectShape>();
    for (const block of this.funcOp.blocks) {
      for (const op of block.operations) {
        if (!(op instanceof ObjectExpressionOp)) continue;
        if (!this.doesNotEscape(op.place)) continue;
        const shape = this.objectShapeFor(op.place);
        if (shape !== null) result.set(op.place.id, shape);
      }
    }
    return result;
  }

  doesNotEscape(value: Value): boolean {
    return this.escape.doesNotEscape(value.id);
  }

  isNonEscapingObjectLiteral(value: Value): boolean {
    const shape = this.objectShapeFor(value);
    return shape !== null && this.doesNotEscape(shape.object.place);
  }

  objectIdFor(value: Value): ValueId | null {
    return this.objectShapeFor(value)?.object.place.id ?? null;
  }

  objectShapeFor(value: Value): ObjectShape | null {
    const cached = this.objectShapeCache.get(value.id);
    if (cached !== undefined || this.objectShapeCache.has(value.id)) return cached ?? null;

    const object = this.resolveObjectExpression(value, new Set());
    const shape = object === null ? null : buildObjectShape(object);
    this.objectShapeCache.set(value.id, shape);
    return shape;
  }

  arrayShapeFor(value: Value): ArrayShape | null {
    const cached = this.arrayShapeCache.get(value.id);
    if (cached !== undefined || this.arrayShapeCache.has(value.id)) return cached ?? null;

    const array = this.resolveArrayExpression(value, new Set());
    const shape = array === null ? null : buildArrayShape(array);
    this.arrayShapeCache.set(value.id, shape);
    return shape;
  }

  aggregateShapeFor(value: Value): AggregateShape | null {
    const objectShape = this.objectShapeFor(value);
    if (objectShape !== null) {
      return { kind: "object", fields: objectShape.fields };
    }

    const arrayShape = this.arrayShapeFor(value);
    if (arrayShape !== null) {
      return { kind: "array", elements: arrayShape.elements };
    }

    return null;
  }

  private resolveObjectExpression(value: Value, seen: Set<ValueId>): ObjectExpressionOp | null {
    if (seen.has(value.id)) return null;
    seen.add(value.id);

    const def = value.def;
    if (def instanceof ObjectExpressionOp) return def;
    if (def instanceof LoadLocalOp || def instanceof StoreLocalOp) {
      return this.resolveObjectExpression(def.value, seen);
    }
    if (def instanceof BindingInitOp) {
      return this.resolveObjectExpression(def.value, seen);
    }
    return null;
  }

  private resolveArrayExpression(value: Value, seen: Set<ValueId>): ArrayExpressionOp | null {
    if (seen.has(value.id)) return null;
    seen.add(value.id);

    const def = value.def;
    if (def instanceof ArrayExpressionOp) return def;
    if (def instanceof LoadLocalOp || def instanceof StoreLocalOp) {
      return this.resolveArrayExpression(def.value, seen);
    }
    if (def instanceof BindingInitOp) {
      return this.resolveArrayExpression(def.value, seen);
    }
    return null;
  }
}

class ReplacementPlan {
  private readonly replacements = new Map<Value, Value>();
  private readonly removals = new RemovalPlan();

  replaceAndRemove(block: BasicBlock, index: number, from: Value, to: Value): void {
    this.replacements.set(from, to);
    this.removals.remove(block, index);
  }

  apply(): boolean {
    if (this.replacements.size === 0) return false;
    for (const [from, to] of this.replacements) {
      from.replaceAllUsesWith(to);
    }
    this.removals.apply();
    return true;
  }
}

class RemovalPlan {
  private readonly removals = new Map<BasicBlock, number[]>();

  remove(block: BasicBlock, index: number): void {
    let indices = this.removals.get(block);
    if (indices === undefined) {
      indices = [];
      this.removals.set(block, indices);
    }
    indices.push(index);
  }

  apply(): boolean {
    if (this.removals.size === 0) return false;
    for (const [block, indices] of this.removals) {
      indices.sort((a, b) => b - a);
      for (const index of indices) {
        block.removeOpAt(index);
      }
    }
    return true;
  }
}

function buildObjectShape(object: ObjectExpressionOp): ObjectShape | null {
  const fields = new Map<string, Value>();

  for (const propertyValue of object.properties) {
    const property = propertyValue.def;
    if (property instanceof SpreadElementOp) return null;
    if (!(property instanceof ObjectPropertyOp)) return null;
    if (property.computed) return null;

    const key = literalPropertyKey(property.key);
    if (key === null) return null;
    fields.set(key, property.value);
  }

  return { object, fields };
}

function buildArrayShape(array: ArrayExpressionOp): ArrayShape | null {
  for (const element of array.elements) {
    if (element.def instanceof SpreadElementOp) return null;
  }
  return { array, elements: array.elements };
}

function literalPropertyKey(value: Value): string | null {
  const def = value.def;
  if (!(def instanceof LiteralOp)) return null;
  if (typeof def.value !== "string" && typeof def.value !== "number") return null;
  return String(def.value);
}

function matchDestructureTarget(
  target: DestructureTarget,
  shape: AggregateShape,
  aggregates: AggregateFacts,
): ScalarBinding[] | null {
  switch (target.kind) {
    case "object":
      return matchObjectTarget(target.properties, shape, aggregates);
    case "array":
      return matchArrayTarget(target.elements, shape, aggregates);
    case "binding":
    case "assignment":
    case "rest":
    case "static-member":
    case "dynamic-member":
      return null;
  }
}

function matchObjectTarget(
  properties: ObjectDestructureOp["properties"],
  shape: AggregateShape,
  aggregates: AggregateFacts,
): ScalarBinding[] | null {
  if (shape.kind !== "object") return null;

  const replacements: ScalarBinding[] = [];
  for (const property of properties) {
    if (property.computed || typeof property.key !== "string") return null;

    const value = shape.fields.get(property.key);
    if (value === undefined) return null;
    const nested = matchTargetValue(property.value, value, aggregates);
    if (nested === null) return null;
    replacements.push(...nested);
  }

  return replacements;
}

function matchArrayTarget(
  elements: ArrayDestructureOp["elements"],
  shape: AggregateShape,
  aggregates: AggregateFacts,
): ScalarBinding[] | null {
  if (shape.kind !== "array") return null;

  const replacements: ScalarBinding[] = [];
  for (let i = 0; i < elements.length; i++) {
    const target = elements[i];
    if (target === null) continue;

    const value = shape.elements[i];
    if (value === undefined) return null;
    const nested = matchTargetValue(target, value, aggregates);
    if (nested === null) return null;
    replacements.push(...nested);
  }

  return replacements;
}

function matchTargetValue(
  target: DestructureTarget,
  value: Value,
  aggregates: AggregateFacts,
): ScalarBinding[] | null {
  if (target.kind === "binding") {
    return target.storage === "local" ? [{ lval: target.place, value }] : null;
  }

  const shape = aggregates.aggregateShapeFor(value);
  if (shape === null) return null;
  return matchDestructureTarget(target, shape, aggregates);
}

function isUsedAsCallCallee(load: LoadStaticPropertyOp): boolean {
  for (const user of load.place.users) {
    if (user instanceof CallExpressionOp && user.callee === load.place) {
      return true;
    }
  }
  return false;
}

function feedsDeleteExpression(load: LoadStaticPropertyOp): boolean {
  for (const user of load.place.users) {
    if (user instanceof UnaryExpressionOp && user.operator === "delete") {
      return true;
    }
  }
  return false;
}
