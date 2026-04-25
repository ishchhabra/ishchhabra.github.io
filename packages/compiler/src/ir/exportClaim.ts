import { ExportDefaultDeclarationOp } from "./ops/module/ExportDefaultDeclaration";
import { ExportNamedDeclarationOp } from "./ops/module/ExportNamedDeclaration";
import { ExportSpecifierOp } from "./ops/module/ExportSpecifier";
import type { Operation } from "./core/Operation";
import type { DeclarationId } from "./core/Value";
import type { FuncOp } from "./core/FuncOp";

/**
 * Returns true if `op`'s `place` is referenced as the `declaration`
 * field of an `ExportNamedDeclarationOp` or
 * `ExportDefaultDeclarationOp` in the same function — i.e. some
 * downstream export op is going to wrap this op as `export <decl>`
 * and codegen should suppress its standalone statement emission.
 *
 * Walks the embedded use chain on `op.place`. Every
 * export wrapper that references this place via its `declaration`
 * field shows up in `uses` because `operands()` includes the
 * `declaration` field.
 *
 * The textbook MLIR replacement for the historical `emit` flag:
 * ops no longer carry a "should I emit?" boolean — codegen and
 * statement-effect analyses infer suppression structurally from
 * the use chain.
 */
export function isClaimedByExportDeclaration(op: Operation): boolean {
  if (op.place === undefined) return false;
  for (const user of op.place.users) {
    if (user instanceof ExportNamedDeclarationOp && user.declaration === op.place) {
      return true;
    }
    if (user instanceof ExportDefaultDeclarationOp && user.declaration === op.place) {
      return true;
    }
  }
  return false;
}

/**
 * True if `declarationId` is named by any export op in the function —
 * i.e. an `ExportSpecifierOp`'s `localDeclarationId`, or an
 * `ExportNamedDeclarationOp` / `ExportDefaultDeclarationOp` whose
 * `declaration` carries this id. Exports observe the binding by
 * declarationId after the import/export refactor (488d360c), so
 * value-level use chains alone don't surface the dependency — passes
 * that need "this binding escapes via export" must consult this.
 */
export function isDeclarationExported(funcOp: FuncOp, declarationId: DeclarationId): boolean {
  for (const block of funcOp.blocks) {
    for (const op of block.operations) {
      if (op instanceof ExportSpecifierOp && op.localDeclarationId === declarationId) {
        return true;
      }
      if (op instanceof ExportNamedDeclarationOp) {
        if (op.declaration?.declarationId === declarationId) return true;
      }
      if (op instanceof ExportDefaultDeclarationOp) {
        if (op.declaration?.declarationId === declarationId) return true;
      }
    }
  }
  return false;
}
