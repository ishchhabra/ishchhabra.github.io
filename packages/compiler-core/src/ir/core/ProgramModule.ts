import { ModuleId } from "./ModuleId";
import { Program } from "./Program";

/**
 * Host-level source kind for a resolved module.
 */
export type ProgramModuleKind =
  | "esm"
  | "cjs"
  | "json"
  | "asset"
  | "virtual"
  | "external"
  | "opaque";

export interface ProgramModuleOptions {
  readonly resolvedId: string;
  readonly kind: ProgramModuleKind;
}

/**
 * One resolved module participating in a compiler program.
 *
 * A program module is a graph-level unit. Lowered compiler artifacts are stored
 * separately by the program build result so the graph remains about identity,
 * metadata, and dependencies.
 */
export class ProgramModule {
  readonly #resolvedId: string;
  readonly #kind: ProgramModuleKind;

  /**
   * Program that currently owns this module.
   *
   * Null means the module is detached or still being assembled.
   */
  public ownerProgram: Program | null = null;

  constructor(
    public readonly id: ModuleId,
    options: ProgramModuleOptions,
  ) {
    this.#resolvedId = options.resolvedId;
    this.#kind = options.kind;
  }

  /**
   * Host-resolved module identity.
   */
  public get resolvedId(): string {
    return this.#resolvedId;
  }

  /**
   * Host-level source kind for this resolved module.
   */
  public get kind(): ProgramModuleKind {
    return this.#kind;
  }
}
