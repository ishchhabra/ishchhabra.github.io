import { ExportDefaultDeclarationOp } from "./ops/module/ExportDefaultDeclaration";
import { ExportNamedDeclarationOp } from "./ops/module/ExportNamedDeclaration";
import type { Operation } from "./core/Operation";

/**
 * Returns true if `op`'s `place` is referenced as the `declaration`
 * field of an `ExportNamedDeclarationOp` or
 * `ExportDefaultDeclarationOp` in the same function — i.e. some
 * downstream export op is going to wrap this op as `export <decl>`
 * and codegen should suppress its standalone statement emission.
 *
 * Walks the embedded use chain on `op.place`. Every
 * export wrapper that references this place via its `declaration`
 * field shows up in `uses` because `getOperands()` includes the
 * `declaration` field.
 *
 * The textbook MLIR replacement for the historical `emit` flag:
 * ops no longer carry a "should I emit?" boolean — codegen and
 * statement-effect analyses infer suppression structurally from
 * the use chain.
 */
export function isClaimedByExportDeclaration(op: Operation): boolean {
  if (op.place === undefined) return false;
  for (const user of op.place.uses) {
    if (user instanceof ExportNamedDeclarationOp && user.declaration === op.place) {
      return true;
    }
    if (user instanceof ExportDefaultDeclarationOp && user.declaration === op.place) {
      return true;
    }
  }
  return false;
}
