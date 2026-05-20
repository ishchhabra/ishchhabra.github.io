import type { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { ProgramBuildResult } from "./buildProgram";
import { runCompilerPasses } from "./runCompilerPasses";

/**
 * Runs local compiler passes for every lowered module in a program.
 *
 * Opaque and external modules have no frontend build result, so they are not
 * present in `moduleBuilds` and are skipped by construction.
 */
export function runProgramCompilerPasses(
  buildResult: ProgramBuildResult,
  ids: IRIdAllocator,
): void {
  for (const [module, moduleBuildResult] of buildResult.moduleBuilds) {
    try {
      runCompilerPasses(moduleBuildResult, ids);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to run compiler passes for ${module.resolvedId}: ${message}`);
    }
  }
}
