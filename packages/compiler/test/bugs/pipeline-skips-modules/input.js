// Bug 1: Pipeline skips modules not in postOrder
// This bug requires a multi-module project setup where module B is built
// by ProjectBuilder (as a dependency) but is not reachable from any entry
// point via the import-graph traversal used to compute postOrder.
//
// To reproduce: compile a project with `includeNodeModules: true` where
// a node_module package is resolved during build but not in the import
// chain from the entry files. The module's IR never goes through SSA,
// producing raw versioned identifiers without phi merges.
//
// Minimal single-file reproduction is not possible — this requires the
// multi-module compilation path in compileProjectDetailed.
//
// Pattern that breaks when SSA is skipped:
function sanitizePath(path) {
  let sanitized = path.replace(/bad/g, "");
  if (sanitized.startsWith("//")) {
    sanitized = "/" + sanitized.replace(/^\/+/, "");
  }
  return sanitized;
}

export { sanitizePath };
