import { Program } from "oxc-parser";

import { BasicBlock } from "../ir/core/Block";
import { FunctionIR } from "../ir/core/FunctionIR";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { ModuleIR } from "../ir/core/ModuleIR";
import { DeclarationTable } from "./declarations/DeclarationTable";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { collectModuleRecords } from "./modules/collectModuleRecords";
import { analyzeScopes } from "./scope/analyzeScopes";
import { DeclarationInstantiationPlan } from "./scope/DeclarationInstantiationPlan";
import { ScopeGraph } from "./scope/ScopeGraph";

export interface IRBuildContext {
  readonly ids: IRIdAllocator;
  readonly declarations: DeclarationTable;
  readonly scopes: ScopeGraph;
  readonly instantiation: DeclarationInstantiationPlan;
}

export interface ModuleIRBuildResult {
  readonly moduleIR: ModuleIR;
  readonly declarations: DeclarationTable;
}

/**
 * Lowers one parsed JavaScript module into IR.
 *
 * This builder owns frontend construction policy. It creates the module's
 * top-level function and delegates statement/expression lowering to frontend
 * lowering code.
 */
export class ModuleIRBuilder {
  constructor(private readonly context: Pick<IRBuildContext, "ids">) {}

  /**
   * Builds a module IR graph from a parsed program.
   */
  public build(program: Program): ModuleIRBuildResult {
    const declarations = new DeclarationTable();
    const scopeAnalysis = analyzeScopes(program, {
      ids: this.context.ids,
      declarations,
    });

    const context: IRBuildContext = {
      ids: this.context.ids,
      declarations,
      scopes: scopeAnalysis.graph,
      instantiation: scopeAnalysis.instantiation,
    };

    const moduleIR = new ModuleIR(this.context.ids.moduleId());
    const entryBlock = new BasicBlock(this.context.ids.blockId());
    const entryFunction = new FunctionIR(this.context.ids.functionId(), {
      params: [],
      blocks: [entryBlock],
    });
    moduleIR.addFunction(entryFunction);
    moduleIR.setEntryFunction(entryFunction);
    collectModuleRecords(moduleIR, scopeAnalysis.graph, program);

    new FunctionIRBuilder(context, moduleIR, entryFunction, entryBlock).lowerProgram(program);

    return { moduleIR, declarations };
  }
}
