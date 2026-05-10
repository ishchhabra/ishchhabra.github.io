import { AnalysisManager, PreservedAnalyses } from "../analysis/AnalysisManager";
import {
  DeclarationReferenceAnalysis,
  type DeclarationReferences,
} from "../analysis/DeclarationReference";
import type { FunctionIR } from "../core/FunctionIR";
import type { ModuleIR } from "../core/ModuleIR";
import { canDropOperationEffects } from "../effects";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import type { ModulePass, PassResult } from "./Pass";

/**
 * Creates a pass that removes declaration initializers for unreferenced source
 * bindings.
 *
 * This is intentionally separate from scalar DCE. Scalar DCE reasons about SSA
 * result users and generic effects; this pass reasons about source declaration
 * reachability, then leaves now-unused pure initializer producers to ordinary
 * DCE.
 */
export function createDeadDeclarationEliminationPass(): ModulePass {
  return {
    name: "dead-declaration-elimination",

    run(moduleIR: ModuleIR, analyses: AnalysisManager): PassResult {
      return new DeadDeclarationEliminationPass(moduleIR, analyses).run();
    },
  };
}

class DeadDeclarationEliminationPass {
  #changed = false;

  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly analyses: AnalysisManager,
  ) {}

  public run(): PassResult {
    const references = this.analyses.getModule(DeclarationReferenceAnalysis, this.moduleIR);

    for (const fn of this.moduleIR.functions) {
      if (this.removeDeadInitializers(fn, references)) {
        this.analyses.invalidateFunction(fn, PreservedAnalyses.none());
        this.#changed = true;
      }
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  private removeDeadInitializers(fn: FunctionIR, references: DeclarationReferences): boolean {
    let changed = false;

    for (const block of fn.blocks) {
      for (const op of Array.from(block.operations)) {
        if (!(op instanceof InitializeBindingOp)) continue;
        if (references.isReferenced(op.declarationId)) continue;
        if (!canRemoveDeadInitializer(op)) continue;

        block.removeOp(op);
        changed = true;
      }
    }

    return changed;
  }
}

function canRemoveDeadInitializer(op: InitializeBindingOp): boolean {
  if (op.bindingValue.users.size > 0) return false;

  const initializer = op.value.definer;
  return initializer === undefined || canDropOperationEffects(initializer.effects());
}
