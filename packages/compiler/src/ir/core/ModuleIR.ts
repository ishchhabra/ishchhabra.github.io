import { Environment } from "../../environment";
import { FuncOp, FuncOpId } from "./FuncOp";
import { Operation } from "./Operation";

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

  constructor(
    public readonly path: string,
    public readonly environment: Environment,
  ) {}
}
