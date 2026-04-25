import {
  BasicBlock,
  BindingDeclOp,
  BindingInitOp,
  ExportDefaultDeclarationOp,
  ExportNamedDeclarationOp,
  Operation,
  Value,
} from "../../../ir";
import { ExportSpecifierOp } from "../../../ir/ops/module/ExportSpecifier";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * A pass that merges separate variable declarations and export specifiers
 * back into a single export declaration. For example:
 *
 * ```js
 * const $1_0 = "https://api.example.com";
 * export { $1_0 as API_URL };
 * ```
 *
 * Will be transformed into:
 *
 * ```js
 * export const API_URL = "https://api.example.com";
 * ```
 *
 * Similarly for functions:
 *
 * ```js
 * function $1_0() { return 42; }
 * export { $1_0 as foo };
 * ```
 *
 * Will be transformed into:
 *
 * ```js
 * export function foo() { return 42; }
 * ```
 *
 * This undoes the split introduced by `scope.rename()` in the frontend,
 * which separates `export const X = ...` into a renamed declaration
 * plus an export specifier. The pass:
 *
 * 1. Renames the BindingIdentifier to the exported name
 * 2. Points the ExportNamedDeclaration's `declaration` at the declaration
 *    instruction's place and clears its specifiers
 * 3. Removes the now-unnecessary ExportSpecifier
 *
 * Codegen detects that the declaration's place is referenced by an
 * export wrapper via the embedded use chain and suppresses the
 * standalone statement automatically — no `emit` flag is required.
 */
export class ExportDeclarationMergingPass extends BaseOptimizationPass {
  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.funcOp.blocks) {
      if (this.mergeExportDeclarationsInBlock(block)) {
        changed = true;
      }
    }

    return { changed };
  }

  private mergeExportDeclarationsInBlock(block: BasicBlock): boolean {
    const instrs = block.operations;
    let changed = false;

    // Collect ExportSpecifier instructions.
    const exportSpecifiers: ExportSpecifierOp[] = [];
    for (const instr of instrs) {
      if (instr instanceof ExportSpecifierOp) {
        exportSpecifiers.push(instr);
      }
    }

    if (exportSpecifiers.length === 0) {
      return false;
    }

    // Track ExportSpecifiers to remove after iteration.
    const toRemove = new Set<ExportSpecifierOp>();

    // For each ExportSpecifier, try to merge with its declaration.
    for (const exportSpec of exportSpecifiers) {
      // Find the binding instruction that defines the local place.
      const localPlace = exportSpec.local;
      const decl = this.findDeclaration(instrs, localPlace);
      if (decl === undefined) continue;

      // Find the ExportNamedDeclaration that contains this ExportSpecifier.
      const exportDecl = instrs.find(
        (instr): instr is ExportNamedDeclarationOp =>
          instr instanceof ExportNamedDeclarationOp &&
          instr.specifiers.some((sp) => sp.id === exportSpec.place.id),
      );
      if (exportDecl === undefined) continue;

      // Only merge single-specifier exports. Multi-specifier exports
      // (e.g. `export { a, b }`) would need each specifier handled separately.
      if (exportDecl.specifiers.length !== 1) continue;

      // `export default` captures the value at that point — it is NOT a live
      // binding. Merging a hoisted var's undefined init into a default export
      // would permanently export `undefined` instead of the final value.
      const metadata = this.funcOp.moduleIR.environment.getDeclarationMetadata(
        localPlace.declarationId,
      );
      const declarationKind = metadata?.kind;
      if (exportSpec.exported === "default" && declarationKind === "var") continue;

      const declIndex = instrs.indexOf(decl);
      const exportDeclIndex = instrs.indexOf(exportDecl);

      let merged: ExportDefaultDeclarationOp | ExportNamedDeclarationOp;
      if (exportSpec.exported === "default") {
        // For default exports, convert to ExportDefaultDeclaration.
        // Don't rename the BI — keeps the function name for debugging/stack traces.
        merged = new ExportDefaultDeclarationOp(exportDecl.id, exportDecl.place, decl.place);
      } else {
        // For named exports, rename the binding and convert to declaration form.
        localPlace.name = exportSpec.exported;

        merged = new ExportNamedDeclarationOp(exportDecl.id, exportDecl.place, [], decl.place);
      }

      // For hoisted var declarations, the merged export must appear right
      // after the declaration (at the hoist point), not at the original
      // export position, to preserve correct statement ordering.
      if (declarationKind === "var" && declIndex < exportDeclIndex) {
        block.removeOpAt(exportDeclIndex);
        block.insertOpAt(declIndex + 1, merged);
      } else {
        block.replaceOp(exportDecl, merged);
      }

      // 4. Mark the ExportSpecifier for removal.
      toRemove.add(exportSpec);

      changed = true;
    }

    // Remove marked ExportSpecifiers in reverse order to preserve indices.
    // Re-read `block.operations` after the in-place edits above.
    const currentInstrs = block.operations;
    for (let i = currentInstrs.length - 1; i >= 0; i--) {
      if (toRemove.has(currentInstrs[i] as ExportSpecifierOp)) {
        block.removeOpAt(i);
      }
    }

    return changed;
  }

  private findDeclaration(
    instrs: readonly Operation[],
    localPlace: Value,
  ): BindingDeclOp | BindingInitOp | undefined {
    for (const instr of instrs) {
      if (instr instanceof BindingDeclOp && instr.place.id === localPlace.id) {
        return instr;
      }
      if (instr instanceof BindingInitOp && instr.place.id === localPlace.id) {
        return instr;
      }
    }
    return undefined;
  }
}
