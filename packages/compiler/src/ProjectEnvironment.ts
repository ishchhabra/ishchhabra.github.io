/**
 * Project-wide shared environment for cross-module ID uniqueness.
 *
 * Each module gets its own {@link Environment}, but cross-module inlining
 * moves FunctionIR objects (with their block IDs) between modules. Unless
 * block IDs are globally unique, the codegen's per-block caches can
 * collide. Passing a ProjectEnvironment to every Environment ensures
 * monotonic, project-wide block IDs — the same strategy React Compiler
 * uses within a component tree (nested functions share one counter).
 */
export class ProjectEnvironment {
  nextBlockId = 0;
}
