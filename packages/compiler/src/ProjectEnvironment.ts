/**
 * Project-wide shared environment for cross-module ID uniqueness.
 *
 * Each module gets its own {@link Environment}, but cross-module inlining
 * moves FunctionIR objects (with their block/place/identifier IDs) between
 * modules. Unless IDs are globally unique, the codegen's per-place caches
 * can collide — an inlined function's capture parameters can overwrite
 * unrelated binding entries in the target module's codegen output.
 *
 * Passing a ProjectEnvironment to every Environment ensures monotonic,
 * project-wide IDs for all IR entities — the same strategy React Compiler
 * uses within a component tree (nested functions share one counter).
 */
export class ProjectEnvironment {
  nextBlockId = 0;
  nextDeclarationId = 0;
  nextIdentifierId = 0;
  nextInstructionId = 0;
  nextPlaceId = 0;
}
