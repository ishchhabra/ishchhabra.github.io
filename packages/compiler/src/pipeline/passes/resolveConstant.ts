import { Environment } from "../../environment";
import { Operation, LoadGlobalOp, LoadStaticPropertyOp, Place, TPrimitiveValue } from "../../ir";

/**
 * Context passed to the `resolveConstant` hook, giving users the ability
 * to read and write the constant map during partial evaluation.
 */
export interface ResolveConstantContext {
  /** Set a compile-time constant value for the current instruction's output place. */
  set(value: TPrimitiveValue): void;
  /** Read a previously resolved constant for a given place. */
  get(place: Place): TPrimitiveValue | undefined;
  /** Check whether a place has a known constant value. */
  has(place: Place): boolean;
  /** The module environment, useful for tracing instruction chains. */
  environment: Environment;
}

/**
 * The signature for the `resolveConstant` hook in compiler options.
 *
 * Called for each instruction during constant propagation. Use `ctx.set()`
 * to provide a compile-time constant value for the instruction's result.
 */
export type ResolveConstantHook = (instruction: Operation, ctx: ResolveConstantContext) => void;

/**
 * Traces a chain of static property accesses back to a `LoadGlobalOp`,
 * returning the fully qualified dotted path.
 *
 * For example, given the IR for `process.env.NODE_ENV`:
 * ```
 * %0 = LoadGlobal("process")
 * %1 = LoadStaticProperty(%0, "env")
 * %2 = LoadStaticProperty(%1, "NODE_ENV")
 * ```
 *
 * Calling `getQualifiedName(instructionFor(%2), environment)` returns
 * `"process.env.NODE_ENV"`.
 *
 * Returns `undefined` if the chain contains a dynamic property access or
 * does not root at a `LoadGlobalOp`.
 */
export function getQualifiedName(
  instruction: Operation,
  environment: Environment,
): string | undefined {
  const segments: string[] = [];
  let current: Operation = instruction;

  for (;;) {
    if (current instanceof LoadGlobalOp) {
      segments.push(current.name);
      break;
    }

    if (current instanceof LoadStaticPropertyOp) {
      segments.push(current.property);
      const objectInstruction = environment.placeToOp.get(current.object.id);
      if (objectInstruction === undefined) {
        return undefined;
      }
      current = objectInstruction;
      continue;
    }

    // Dynamic property or any other instruction — chain is not statically resolvable.
    return undefined;
  }

  return segments.reverse().join(".");
}
