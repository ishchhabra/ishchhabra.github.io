import type { DeclarationId } from "../core";
import type { ModuleIR } from "../core/ModuleIR";
import type { AnalysisManager, ModuleAnalysis } from "./AnalysisManager";

export interface BindingEscapeInfo {
  readonly escapingDeclarations: ReadonlySet<DeclarationId>;
}

/**
 * Finds declaration binding cells that are observable outside local function rewrites.
 *
 * Imports, exports, and closure captures require a materialized binding cell because
 * other module records or function objects can observe the binding's live value.
 */
export const BindingEscapeAnalysis: ModuleAnalysis<BindingEscapeInfo> = {
  name: "binding-escape",

  run(moduleIR: ModuleIR, _analyses: AnalysisManager): BindingEscapeInfo {
    const escapingDeclarations = new Set<DeclarationId>();

    collectModuleEscapes(moduleIR, escapingDeclarations);
    collectClosureEscapes(moduleIR, escapingDeclarations);

    return { escapingDeclarations };
  },
};

function collectModuleEscapes(moduleIR: ModuleIR, escapingDeclarations: Set<DeclarationId>): void {
  for (const record of moduleIR.imports) {
    if (record.kind !== "bare") {
      escapingDeclarations.add(record.declarationId);
    }
  }

  for (const record of moduleIR.exports) {
    switch (record.kind) {
      case "local":
      case "default-local":
        escapingDeclarations.add(record.declarationId);
        break;

      case "default-value":
      case "re-export":
      case "export-all":
        break;
    }
  }
}

function collectClosureEscapes(moduleIR: ModuleIR, escapingDeclarations: Set<DeclarationId>): void {
  for (const fn of moduleIR.functions) {
    for (const param of fn.params) {
      if (param.kind === "capture") {
        escapingDeclarations.add(param.declarationId);
      }
    }
  }
}
