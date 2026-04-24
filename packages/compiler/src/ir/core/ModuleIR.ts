import { Environment } from "../../environment";
import { FuncOp, FuncOpId } from "./FuncOp";
import { Operation } from "./Operation";
import type { Value } from "./Value";
import { emptyModuleSummary, type ModuleSummary } from "./ModuleSummary";
import { ExportSpecifierOp } from "../ops/module/ExportSpecifier";
import { StoreLocalOp } from "../ops/mem/StoreLocal";

export type ModuleGlobal =
  | {
      kind: "import";
      source: string;
      name: string;
    }
  | {
      kind: "builtin";
    };

export interface ModuleExport {
  /** The ExportDeclarationOp for the export */
  instruction: Operation;

  /** The instruction that declares the exported variable (undefined for anonymous export default) */
  declaration?: Operation;
}

/**
 * The binding place (SSA Value) this export references, or undefined
 * for anonymous-expression exports (`export default 5`). Normalizes
 * over the two shapes: `ExportSpecifier` carries a declaration id; a
 * declaration-form export (`export const X = ...`) carries the
 * declaration store whose `lval` is the binding.
 *
 * Consumers reasoning about the exported binding (memory analyses,
 * cross-module folding) should use this rather than branching on
 * the export's shape.
 */
export function getExportBindingPlace(
  exp: ModuleExport,
  environment: Environment,
): Value | undefined {
  if (exp.instruction instanceof ExportSpecifierOp) {
    return environment.getDeclarationBinding(exp.instruction.localDeclarationId);
  }
  const decl = exp.declaration;
  if (decl instanceof StoreLocalOp) return decl.lval;
  return decl?.place;
}

/**
 * The compilation unit for a single source file.
 *
 * `functions` is the registry of every {@link FuncOp} that belongs to
 * this module — both top-level declarations and nested closures (arrow
 * expressions, function expressions, function declarations). Cross-module
 * inlining clones a function from another module into this one; the clone
 * is registered here. The pipeline iterates this map.
 *
 * Note: every {@link FuncOp} carries a `moduleIR` back-pointer to its
 * owning `ModuleIR`, so the registry-and-back-pointer pair is the source
 * of truth for "which functions belong to which module". Code that asks
 * "what module does this function belong to?" should read `fn.moduleIR`
 * directly rather than searching this map.
 */
export class ModuleIR {
  public readonly functions: Map<FuncOpId, FuncOp> = new Map();
  public readonly globals: Map<string, ModuleGlobal> = new Map();
  public readonly exports: Map<string, ModuleExport> = new Map();

  /**
   * The module's top-level function — the implicit `function () { <module body> }`
   * the frontend emits around every module. Set on the first {@link FuncOp}
   * registration; never reassigned.
   *
   * Codegen walks out from here; pipeline passes iterate {@link functions}
   * for all functions (entry + nested) without caring which is which.
   */
  public entryFuncOp: FuncOp | undefined = undefined;

  /**
   * Cross-module facts about this module. Populated by the module's
   * own passes (currently {@link ConstantPropagationPass}); consumed
   * by analyses running on downstream modules that import from this
   * one. Mirrors LLVM ThinLTO module summaries.
   */
  public readonly summary: ModuleSummary = emptyModuleSummary();

  constructor(
    public readonly path: string,
    public readonly environment: Environment,
  ) {}
}
