import { generateJavaScript } from "../backend/js/generateJavaScript";
import type { ProgramModule } from "../ir/core/ProgramModule";
import type { ProgramBuildResult } from "./buildProgram";

/**
 * Emits JavaScript for every lowered module in a program.
 *
 * Opaque and external modules have no frontend build result, so they are not
 * present in `moduleBuilds` and are skipped by construction.
 */
export function emitProgramJavaScript(buildResult: ProgramBuildResult): Map<ProgramModule, string> {
  const output = new Map<ProgramModule, string>();

  for (const [module, moduleBuildResult] of buildResult.moduleBuilds) {
    try {
      output.set(module, generateJavaScript(moduleBuildResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to emit ${module.resolvedId}: ${message}`);
    }
  }

  return output;
}
