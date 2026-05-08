import type { BasicBlock } from "./Block";
import type { IRIdAllocator } from "./IRIdAllocator";
import type { Value } from "./Value";

/**
 * Remapping state used when cloning operations into another IR graph.
 *
 * The context is intentionally narrow: it provides fresh ids and explicit
 * remapping hooks, but it does not expose modules, functions, or frontend
 * builder state.
 */
export interface OperationCloneContext {
  readonly ids: IRIdAllocator;

  /**
   * Remaps an operand value from the source graph to the clone graph.
   */
  value(value: Value): Value;

  /**
   * Remaps or creates the cloned result corresponding to a source result.
   */
  result(value: Value): Value;

  /**
   * Remaps a successor block from the source graph to the clone graph.
   */
  block(block: BasicBlock): BasicBlock;
}
