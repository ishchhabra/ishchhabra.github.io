import {
  Identifier,
  IdentifierId,
  LoadLocalInstruction,
  LoadPhiInstruction,
  Place,
  ReturnTerminal,
  StoreLocalInstruction,
  SwitchTerminal,
  ThrowTerminal,
} from "../../ir";
import { BaseTerminal } from "../../ir/base/Terminal";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * SSA-phase Copy Propagation.
 *
 * Eliminates redundant copies by replacing all uses of a copy's output
 * with its input. On SSA form each identifier has exactly one definition,
 * so copies can be followed transitively.
 *
 * Two kinds of copies are tracked:
 *   - LoadLocal: `$b = LoadLocal($a)` — load a variable into a temp
 *   - StoreLocal: `lval=$b, value=$a` — bind a new variable to a temp
 *
 * Together these form chains like:
 *   LoadLocal($load_a, $a) → StoreLocal(lval=$b, value=$load_a) → LoadLocal($load_b, $b)
 *
 * After propagation, uses of `$load_b` resolve to `$a` directly, and
 * the intermediate instructions become dead (removed by DCE).
 */
export class CopyPropagationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly phis: Set<Phi>,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    // 1. Build a map from copy destination → copy source.
    //    LoadLocal: place.identifier → value (the variable being loaded)
    //    StoreLocal: lval.identifier → value (the temp being stored)
    const copySource = new Map<IdentifierId, Place>();

    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (instr instanceof LoadLocalInstruction && !(instr instanceof LoadPhiInstruction)) {
          copySource.set(instr.place.identifier.id, instr.value);
        } else if (instr instanceof StoreLocalInstruction) {
          copySource.set(instr.lval.identifier.id, instr.value);
        }
      }
    }

    // 2. Resolve chains: if $c → $b and $b → $a, then $c → $a.
    const resolved = new Map<IdentifierId, Place>();
    const resolving = new Set<IdentifierId>();

    const resolve = (id: IdentifierId): Place | undefined => {
      if (resolved.has(id)) return resolved.get(id);
      if (resolving.has(id)) return undefined; // cycle guard
      const source = copySource.get(id);
      if (source === undefined) return undefined;

      resolving.add(id);
      const deeper = resolve(source.identifier.id);
      resolving.delete(id);

      const result = deeper ?? source;
      // Only record if we actually skip at least one level.
      if (result.identifier.id !== source.identifier.id) {
        resolved.set(id, result);
      }
      return result;
    };

    for (const id of copySource.keys()) {
      resolve(id);
    }

    if (resolved.size === 0) {
      return { changed: false };
    }

    // 3. Rewrite all instructions and terminals that read a propagated place.
    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const rewriteMap = new Map<Identifier, Place>();

        for (const place of instr.getReadPlaces()) {
          const replacement = resolved.get(place.identifier.id);
          if (replacement !== undefined) {
            rewriteMap.set(place.identifier, replacement);
          }
        }

        if (rewriteMap.size > 0) {
          block.instructions[i] = instr.rewrite(rewriteMap);
          changed = true;
        }
      }

      if (block.terminal) {
        const rewriteMap = new Map<Identifier, Place>();
        for (const place of block.terminal.getReadPlaces()) {
          const replacement = resolved.get(place.identifier.id);
          if (replacement !== undefined) {
            rewriteMap.set(place.identifier, replacement);
          }
        }
        if (rewriteMap.size > 0) {
          block.terminal = this.rewriteTerminal(block.terminal, rewriteMap);
          changed = true;
        }
      }
    }

    // 4. Rewrite phi operands that reference propagated places.
    for (const phi of this.phis) {
      for (const [blockId, place] of phi.operands) {
        const replacement = resolved.get(place.identifier.id);
        if (replacement !== undefined) {
          phi.operands.set(blockId, replacement);
          changed = true;
        }
      }
    }

    return { changed };
  }

  private rewriteTerminal(terminal: BaseTerminal, values: Map<Identifier, Place>): BaseTerminal {
    if (terminal instanceof ReturnTerminal && values.has(terminal.value.identifier)) {
      return new ReturnTerminal(terminal.id, values.get(terminal.value.identifier)!);
    }

    if (terminal instanceof ThrowTerminal && values.has(terminal.value.identifier)) {
      return new ThrowTerminal(terminal.id, values.get(terminal.value.identifier)!);
    }

    if (terminal instanceof SwitchTerminal) {
      const discriminant = values.get(terminal.discriminant.identifier) ?? terminal.discriminant;
      const cases = terminal.cases.map((c) => ({
        test: c.test !== null ? (values.get(c.test.identifier) ?? c.test) : null,
        block: c.block,
      }));
      if (
        discriminant !== terminal.discriminant ||
        cases.some((c, i) => c.test !== terminal.cases[i].test)
      ) {
        return new SwitchTerminal(terminal.id, discriminant, cases, terminal.fallthrough);
      }
    }

    return terminal;
  }
}
