import type { Environment } from "../../environment";
import type { Operation } from "../core/Operation";

/**
 * Derived effects predicates.
 *
 * Passes never query the raw five axes on {@link Operation}. They
 * call the predicate matching their transformation's actual
 * requirement.
 *
 * | Predicate           | Used by                              | Question                                            |
 * |---------------------|--------------------------------------|-----------------------------------------------------|
 * | `isDCERemovable`    | DCE                                  | "Is it safe to delete this op when its result is unused?" |
 * | `isSpeculatable`    | LICM, code motion                    | "Is it safe to execute this op even if it wouldn't have run?" |
 * | `isDuplicable`      | copy-prop, expression inlining       | "Is it safe to evaluate this op more than once?"    |
 * | `canReorderWith`    | scheduling, hoisting                 | "Can I swap these two ops?"                         |
 *
 * The five-axis decomposition lets each predicate ask the precise
 * combination it needs. A single boolean (the old `hasSideEffects`)
 * conflated independent properties and forced every pass into the
 * worst-case answer.
 */

/**
 * Safe to delete this op when its result is unused?
 *
 * - No memory writes (the op doesn't mutate anything).
 * - Doesn't throw (deletion would skip an exception that JS spec says
 *   should happen).
 * - Not externally observable (deletion would skip console output, a
 *   debugger statement, etc.).
 *
 * Note: `mayDiverge` and `isDeterministic` deliberately *don't*
 * appear here. `Math.random()` is not deterministic but is still
 * DCE-removable (no writes, no throw, no observability) — the value
 * was unused anyway. An infinite loop is divergent but if its
 * result were unused it could in principle be removed; in practice
 * loop terminators have other axes that block this.
 */
export function isDCERemovable(op: Operation, env?: Environment): boolean {
  if (op.getMemoryEffects(env).writes.length > 0) return false;
  if (op.mayThrow(env)) return false;
  if (op.isObservable(env)) return false;
  return true;
}

/**
 * Safe to execute this op even if control flow wouldn't have reached
 * it? Code motion (LICM, hoisting) asks this.
 *
 * Adds `mayDiverge` to the DCE set: speculative execution of a
 * divergent op would hang the program.
 */
export function isSpeculatable(op: Operation, env?: Environment): boolean {
  if (op.getMemoryEffects(env).writes.length > 0) return false;
  if (op.mayThrow(env)) return false;
  if (op.mayDiverge(env)) return false;
  if (op.isObservable(env)) return false;
  return true;
}

/**
 * Safe to evaluate this op more than once?
 *
 * Stricter than `isSpeculatable`: also forbids reads of mutable
 * memory (re-read could see a different value) and non-determinism
 * (`Math.random()` would return a different value at each duplicated
 * site). This is the predicate that resolves the getter-duplication
 * hazard called out in `packages/compiler/CLAUDE.md`: a `LoadProperty`
 * has `mayThrow=true` (getter could throw on a missing prototype),
 * which makes `isDuplicable` false even when its `reads` set looks
 * empty.
 */
export function isDuplicable(op: Operation, env?: Environment): boolean {
  const mem = op.getMemoryEffects(env);
  if (mem.reads.length > 0) return false;
  if (mem.writes.length > 0) return false;
  if (!op.isDeterministic) return false;
  if (op.mayThrow(env)) return false;
  if (op.mayDiverge(env)) return false;
  return true;
}

/**
 * Safe to swap these two ops? Pure check today: if neither op has
 * any observable effect (memory or otherwise), they trivially
 * commute. A future refinement would ask the alias oracle whether
 * `a`'s writes alias `b`'s reads/writes; for now this is a
 * conservative `both isSpeculatable` test which is correct but
 * leaves wins on the table.
 */
export function canReorderWith(a: Operation, b: Operation, env?: Environment): boolean {
  return isSpeculatable(a, env) && isSpeculatable(b, env);
}
