import type { DeclarationTable } from "../../frontend/declarations/DeclarationTable";
import { bindingSemantics } from "../../frontend/scope/BindingSemantics";
import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { FunctionIR, Operation, valueUseSites, Value } from "../core";
import { bindingPatternOperands, rewriteBindingPatternOperands } from "../core/DestructurePattern";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { ConstantOp } from "../ops/constants/ConstantOp";
import { LoadThisOp } from "../ops/functions/LoadThisOp";
import { MetaPropertyOp } from "../ops/functions/MetaPropertyOp";
import { SequenceExpressionOp } from "../ops/operators/SequenceExpressionOp";
import { CopyValueOp } from "../ops/values/CopyValueOp";
import { FunctionPass, PassResult } from "./Pass";

export interface ValueMaterializationPassOptions {
  /**
   * Allocator used for generated materialized value slots and copy operations.
   */
  readonly ids: IRIdAllocator;
  readonly declarations: DeclarationTable;
}

/**
 * Materializes non-duplicable SSA values into generated JavaScript locals.
 *
 * This pass runs after SSA/binding promotion and before JavaScript codegen.
 * It prevents effectful or identity-producing expressions from being emitted
 * multiple times after source bindings have been promoted away.
 *
 * @example
 * ```txt
 * // Before
 * q = ConstructOp(QueryClient)
 * r = CallOp(createRouter, q)
 * CallOp(setup, r, q)
 * ReturnTerminatorOp(r)
 *
 * // After
 * q = ConstructOp(QueryClient)
 * CopyValueOp(qLocal, q)
 * r = CallOp(createRouter, qLocal)
 * CopyValueOp(rLocal, r)
 * CallOp(setup, rLocal, qLocal)
 * ReturnTerminatorOp(rLocal)
 * ```
 */
export function createValueMaterializationPass(
  options: ValueMaterializationPassOptions,
): FunctionPass {
  return {
    name: "value-materialization",

    run(fn: FunctionIR, _analyses: AnalysisManager): PassResult {
      return new ValueMaterializationPass(fn, options).run();
    },
  };
}

class ValueMaterializationPass {
  #changed = false;

  constructor(
    private readonly fn: FunctionIR,
    private readonly options: ValueMaterializationPassOptions,
  ) {}

  public run(): PassResult {
    for (const block of this.fn.blocks) {
      for (let i = 0; i < block.operations.length; i++) {
        const op = block.operations[i];
        if (op instanceof CopyValueOp) continue;
        if (op.results.length !== 1) continue;

        const result = op.result;
        if (this.canRemainExpression(op, result)) continue;

        const local = new Value(this.options.ids.valueId());
        const copy = new CopyValueOp(this.options.ids.operationId(), local, result);

        block.insertOp(i + 1, copy);
        this.replaceUses(result, local, copy);
        this.#changed = true;
        i++;
      }
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  private canRemainExpression(op: Operation, result: Value): boolean {
    if (isSafelyDuplicable(op, this.options.declarations)) return true;
    if (result.users.size === 0) return true;
    if (valueUseSites(result).length !== 1) return false;

    const users = [...result.users];
    if (users.length !== 1) return false;

    const [user] = users;
    if (!(user instanceof Operation)) return false;
    if (user instanceof InitializeBindingOp) return true;
    if (user instanceof SequenceExpressionOp) return true;

    return !inliningWouldReorder(op, user);
  }

  private replaceUses(from: Value, to: Value, materializer: CopyValueOp): void {
    for (const user of Array.from(from.users)) {
      if (user === materializer) continue;

      if (user instanceof Operation) {
        this.replaceOperationUse(user, from, to);
        continue;
      }

      this.replaceFunctionUse(user, from, to);
    }
  }

  private replaceOperationUse(op: Operation, from: Value, to: Value): void {
    const operands = op.operands();
    if (!operands.includes(from)) return;

    const replacement = op.withOperands(
      operands.map((operand) => (operand === from ? to : operand)),
    );

    if (replacement === op) return;

    const block = op.ownerBlock;
    if (block === null) {
      throw new Error(`${op.constructor.name}#${op.id} is detached`);
    }

    block.replaceOp(op, replacement);
  }

  private replaceFunctionUse(fn: FunctionIR, from: Value, to: Value): void {
    fn.setParams(
      fn.params.map((param) => {
        if (param.kind === "capture") return param;

        const operands = bindingPatternOperands(param.target);
        if (!operands.includes(from)) return param;

        return {
          ...param,
          target: rewriteBindingPatternOperands(
            param.target,
            operands.map((operand) => (operand === from ? to : operand)),
          ),
        };
      }),
    );
  }
}

function isSafelyDuplicable(op: Operation, declarations: DeclarationTable): boolean {
  return (
    op instanceof ConstantOp ||
    op instanceof LoadThisOp ||
    op instanceof MetaPropertyOp ||
    isDeclarationAnchorReference(op, declarations)
  );
}

function isDeclarationAnchorReference(op: Operation, declarations: DeclarationTable): boolean {
  if (!(op instanceof InitializeBindingOp)) return false;
  if (!declarations.has(op.declarationId)) {
    throw new Error(`Missing declaration metadata for Declaration#${op.declarationId}`);
  }

  return bindingSemantics(declarations.get(op.declarationId)).preservesDeclarationAnchor;
}

function inliningWouldReorder(definer: Operation, user: Operation): boolean {
  const block = definer.ownerBlock;
  if (block === null || user.ownerBlock !== block) return true;

  const operations = block.operations;
  const definerIndex = operations.indexOf(definer);
  const userIndex = operations.indexOf(user);
  if (definerIndex < 0 || userIndex < 0 || userIndex < definerIndex) {
    return true;
  }

  for (let index = definerIndex + 1; index < userIndex; index++) {
    const op = operations[index];
    if (!hasRequiredStandaloneEffect(op)) continue;
    if (!flowsTo(op, user)) return true;
  }

  return false;
}

function hasRequiredStandaloneEffect(op: Operation): boolean {
  const effects = op.effects();

  return (
    effects.memory.writes.length > 0 ||
    effects.mayThrow ||
    effects.mayDiverge ||
    effects.isObservable
  );
}

function flowsTo(candidate: Operation, user: Operation): boolean {
  return candidate.results.some((result) => reachesUser(result, user, new Set()));
}

function reachesUser(value: Value, user: Operation, visited: Set<Value>): boolean {
  if (visited.has(value)) return false;
  visited.add(value);

  for (const valueUser of value.users) {
    if (valueUser === user) return true;
    if (!(valueUser instanceof Operation)) continue;

    for (const result of valueUser.results) {
      if (reachesUser(result, user, visited)) return true;
    }
  }

  return false;
}
