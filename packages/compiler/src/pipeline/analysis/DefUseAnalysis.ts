import { BaseInstruction, IdentifierId } from "../../ir";
import { BaseTerminal } from "../../ir/base/Terminal";
import { BaseStructure } from "../../ir/core/Structure";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { FunctionAnalysis, AnalysisManager } from "./AnalysisManager";

/** An instruction, terminal, or structure that reads a place. */
export type User = BaseInstruction | BaseTerminal | BaseStructure;

/**
 * The result of def-use analysis: bidirectional mappings between
 * identifiers and the instructions that define or read them.
 */
export class DefUseResult {
  constructor(
    private readonly defs: ReadonlyMap<IdentifierId, BaseInstruction>,
    private readonly uses: ReadonlyMap<IdentifierId, ReadonlySet<User>>,
  ) {}

  /** Returns the instruction that defines this identifier, or undefined. */
  getDefiner(id: IdentifierId): BaseInstruction | undefined {
    return this.defs.get(id);
  }

  /** Returns all users (instructions, terminals, structures) that read this identifier. */
  getUsers(id: IdentifierId): ReadonlySet<User> {
    return this.uses.get(id) ?? emptySet;
  }

  /** Returns true if this identifier is read by at least one user. */
  isUsed(id: IdentifierId): boolean {
    return (this.uses.get(id)?.size ?? 0) > 0;
  }

  /** Returns the number of users that read this identifier. */
  useCount(id: IdentifierId): number {
    return this.uses.get(id)?.size ?? 0;
  }

  /** Returns true if this identifier has exactly one user. */
  hasSingleUse(id: IdentifierId): boolean {
    return (this.uses.get(id)?.size ?? 0) === 1;
  }
}

const emptySet: ReadonlySet<User> = new Set();

/**
 * Computes def-use information for a single function.
 *
 * Scans all instructions, terminals, and structures in the function's
 * basic blocks to build two maps:
 *
 * - **defs**: identifier → defining instruction
 *   (via `instr.getWrittenPlaces()`)
 * - **uses**: identifier → set of users (instructions, terminals, and
 *   structures) that read it (via `getReadPlaces()`)
 *
 * In SSA form each identifier has exactly one definition, so the defs
 * map is a simple 1:1 lookup. The uses map is 1:N since a value can
 * be read by multiple users.
 *
 * Usage:
 * ```ts
 * const defUse = AM.get(DefUseAnalysis, functionIR);
 *
 * defUse.getDefiner(id)    // instruction that defines id
 * defUse.getUsers(id)      // all readers of id
 * defUse.isUsed(id)        // true if anyone reads id
 * defUse.hasSingleUse(id)  // true if exactly one reader
 * ```
 */
export class DefUseAnalysis extends FunctionAnalysis<DefUseResult> {
  run(functionIR: FunctionIR, _AM: AnalysisManager): DefUseResult {
    const defs = new Map<IdentifierId, BaseInstruction>();
    const uses = new Map<IdentifierId, Set<User>>();

    for (const block of functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        // Register definitions.
        for (const place of instr.getWrittenPlaces()) {
          defs.set(place.identifier.id, instr);
        }

        // Register uses from instruction operands.
        addUses(uses, instr.getReadPlaces(), instr);
      }

      // Register uses from terminal operands.
      if (block.terminal) {
        addUses(uses, block.terminal.getReadPlaces(), block.terminal);
      }
    }

    // Register uses from structure reads and writes.
    for (const structure of functionIR.structures.values()) {
      addUses(uses, structure.getReadPlaces(), structure);
      addUses(uses, structure.getWrittenPlaces(), structure);
    }

    return new DefUseResult(defs, uses);
  }
}

function addUses(
  uses: Map<IdentifierId, Set<User>>,
  places: readonly { readonly identifier: { readonly id: IdentifierId } }[],
  user: User,
): void {
  for (const place of places) {
    let set = uses.get(place.identifier.id);
    if (!set) {
      set = new Set();
      uses.set(place.identifier.id, set);
    }
    set.add(user);
  }
}
