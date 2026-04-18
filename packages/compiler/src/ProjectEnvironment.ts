/**
 * Project-wide shared environment for cross-module ID uniqueness.
 *
 * Each module gets its own {@link Environment}, but cross-module inlining
 * moves FuncOp objects (with their block/value IDs) between modules.
 * Unless IDs are globally unique, the codegen's per-value caches can
 * collide — an inlined function's capture parameters can overwrite
 * unrelated binding entries in the target module's codegen output.
 *
 * Passing a ProjectEnvironment to every Environment ensures monotonic,
 * project-wide IDs for all IR entities.
 */
export class ProjectEnvironment {
  nextBlockId = 0;
  nextDeclarationId = 0;
  nextOperationId = 0;
  nextValueId = 0;
}
