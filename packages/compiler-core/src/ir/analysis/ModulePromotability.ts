import { DeclarationId } from "../core";
import { ModuleIR } from "../core/ModuleIR";
import { AnalysisManager, ModuleAnalysis } from "./AnalysisManager";

export interface ModulePromotability {
  readonly nonPromotableDeclarations: ReadonlySet<DeclarationId>;
}

/**
 * Computes module-level binding promotion policy.
 *
 * Imports, exports, and other module-boundary declarations must keep their
 * binding identity even when their local operations look SSA-promotable.
 */
export const ModulePromotabilityAnalysis: ModuleAnalysis<ModulePromotability> =
  {
    name: "module-promotability",

    run(moduleIR: ModuleIR, _analyses: AnalysisManager) {
      const nonPromotableDeclarations: Set<DeclarationId> = new Set();

      for (const record of moduleIR.imports) {
        if (record.kind !== "bare") {
          nonPromotableDeclarations.add(record.declarationId);
        }
      }

      for (const record of moduleIR.exports) {
        switch (record.kind) {
          case "local":
          case "default-local":
            nonPromotableDeclarations.add(record.declarationId);
            break;

          case "default-value":
          case "re-export":
          case "export-all":
            break;
        }
      }

      for (const fn of moduleIR.functions) {
        for (const param of fn.params) {
          if (param.kind === "capture") {
            nonPromotableDeclarations.add(param.declarationId);
          }
        }
      }

      return { nonPromotableDeclarations };
    },
  };
