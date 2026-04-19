import { Environment } from "../../environment";
import { FuncOp, FuncOpId } from "./FuncOp";
import { Operation } from "./Operation";
import type { TPrimitiveValue } from "../ops/prim/Literal";

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
   * Exported names whose value has been proven to be a compile-time
   * constant. Populated by {@link ConstantPropagationPass} on this
   * module's entry function; consumed by the same pass on downstream
   * modules when evaluating a `LoadGlobal` of an imported binding.
   *
   * Empty for modules that haven't run constant propagation yet, or
   * whose exports aren't constants. A missing entry means "not known
   * to be constant" — not "known to be non-constant."
   */
  public readonly exportedConstants: Map<string, TPrimitiveValue> = new Map();

  constructor(
    public readonly path: string,
    public readonly environment: Environment,
  ) {}
}
