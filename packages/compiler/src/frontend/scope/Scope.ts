import type {
  ArrowFunctionExpression,
  CatchClause,
  Class,
  Declaration,
  Directive,
  Expression,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Function,
  JSXElementName,
  MemberExpression,
  ModuleDeclaration,
  Node,
  Program,
  Statement,
  SwitchStatement,
  VariableDeclaration,
} from "oxc-parser";
import { KEYS } from "eslint-visitor-keys";
import type * as AST from "../estree";
import { makeScopeId, type ScopeId } from "../../ir/core/LexicalScope";

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

export type BindingKind = "var" | "let" | "const" | "function" | "class" | "param" | "catch";

/** A resolved reference to a binding, annotated with the scope it occurs in. */
export interface Reference {
  node: AST.Value;
  scope: Scope;
}

/** A declared binding (variable, function, class, param, etc.) in a scope. */
export interface Binding {
  kind: BindingKind;
  scope: Scope;
  /** Write references (reassignments). */
  mutations: Reference[];
  /** Read references. */
  references: Reference[];
}

/** A variable declaration entry in a scope's declaration inventory. */
export interface VarDeclaration {
  node: VariableDeclaration;
}

/** A lexical (let/const) declaration entry. */
export interface LexicalDeclaration {
  kind: "let" | "const";
  node: VariableDeclaration;
}

/** A class declaration entry. */
export interface ClassDeclarationEntry {
  node: Class;
}

/** A function declaration entry, in spec initialization order (last wins). */
export interface FunctionDeclarationEntry {
  node: Function;
}

export class Scope {
  public readonly id: ScopeId = makeScopeId(nextScopeId++);
  public readonly bindings = new Map<string, Binding>();
  public readonly data = new Map<string, unknown>();

  // ---- Pre-computed declaration inventories (populated during scope analysis) ----

  /** `var` declarations owned by this scope (function/program scopes only). */
  public readonly varDeclarations: VarDeclaration[] = [];

  /** `let`/`const` declarations owned by this scope. */
  public readonly lexicalDeclarations: LexicalDeclaration[] = [];

  /** Class declarations owned by this scope. */
  public readonly classDeclarations: ClassDeclarationEntry[] = [];

  /**
   * Function declarations to initialize, in spec order (last declaration
   * of each name wins, per §10.2.11 step 29). For function/program scopes
   * these are hoisted functions; for block scopes (module/strict mode)
   * these are block-scoped function declarations.
   */
  public readonly functionsToInitialize: FunctionDeclarationEntry[] = [];

  constructor(
    public readonly parent: Scope | null,
    public readonly kind: "program" | "function" | "block",
  ) {}

  /** Look up a binding by name, walking the scope chain. */
  getBinding(name: string): Binding | undefined {
    // oxlint-disable-next-line typescript/no-this-alias
    let scope: Scope | null = this;
    while (scope !== null) {
      const binding = scope.bindings.get(name);
      if (binding !== undefined) return binding;
      scope = scope.parent;
    }
    return undefined;
  }

  /** Get custom data, walking the scope chain. */
  getData(name: string): unknown {
    // oxlint-disable-next-line typescript/no-this-alias
    let scope: Scope | null = this;
    while (scope !== null) {
      if (scope.data.has(name)) return scope.data.get(name);
      scope = scope.parent;
    }
    return undefined;
  }

  /** Set custom data on this scope (does not walk the chain). */
  setData(name: string, value: unknown): void {
    this.data.set(name, value);
  }

  /** Walk up to the nearest function or program scope. */
  getFunctionParent(): Scope | null {
    let scope = this.parent;
    while (scope !== null) {
      if (scope.kind === "function" || scope.kind === "program") return scope;
      scope = scope.parent;
    }
    return null;
  }

  /** Walk up to the program scope. */
  getProgramParent(): Scope {
    // oxlint-disable-next-line typescript/no-this-alias
    let scope: Scope = this;
    while (scope.parent !== null) {
      scope = scope.parent;
    }
    return scope;
  }
}

/** Maps scope-creating AST nodes to their Scope. */
export type ScopeMap = Map<Node, Scope>;

export interface AnalysisResult {
  programScope: Scope;
  scopeMap: ScopeMap;
}

let nextScopeId = 0;

/**
 * Analyzes an ESTree AST and builds a scope tree with binding information.
 * Two-phase approach:
 *   Phase 1 — discover scopes, hoist declarations, register bindings
 *   Phase 2 — collect references and mutations with explicit visitors
 */
export function analyzeScopes(program: Program): AnalysisResult {
  const scopeMap: ScopeMap = new Map();
  const programScope = new Scope(null, "program");
  scopeMap.set(program, programScope);

  visitNode(program, programScope, scopeMap);
  collectReferences(program, programScope, scopeMap);

  return { programScope, scopeMap };
}

// -----------------------------------------------------------------------
// Phase 1: Scope and binding discovery
// -----------------------------------------------------------------------

function visitNode(node: Node, scope: Scope, scopeMap: ScopeMap): void {
  switch (node.type) {
    // ----- Scope-creating nodes -----

    case "Program":
      visitStatements(node.body as Statement[], scope, scopeMap);
      break;

    case "BlockStatement": {
      const blockScope = new Scope(scope, "block");
      scopeMap.set(node, blockScope);
      visitStatements(node.body, blockScope, scopeMap);
      break;
    }

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      visitFunction(node, scope, scopeMap);
      break;

    case "ClassExpression": {
      // ECMA-262: optional BindingIdentifier is scoped to the class (visible in the
      // body). ClassHeritage is evaluated in the surrounding lexical environment.
      const outer = scope;
      const classScope = new Scope(outer, "block");
      scopeMap.set(node, classScope);
      if (node.id) {
        registerBinding(node.id.name, "class", classScope);
      }
      visitClassBody(node, outer, classScope, scopeMap);
      break;
    }

    case "ClassDeclaration": {
      if (node.id) {
        registerBinding(node.id.name, "class", scope);
      }
      // Class body elements use an inner contour so program/function hoisting
      // inventories on the outer scope are not applied when lowering the body.
      const classBodyScope = new Scope(scope, "block");
      scopeMap.set(node.body, classBodyScope);
      visitClassBody(node, scope, classBodyScope, scopeMap);
      break;
    }

    case "ForStatement":
      visitForStatement(node, scope, scopeMap);
      break;

    case "ForInStatement":
    case "ForOfStatement":
      visitForInOfStatement(node, scope, scopeMap);
      break;

    case "SwitchStatement":
      visitSwitchStatement(node, scope, scopeMap);
      break;

    case "CatchClause":
      visitCatchClause(node, scope, scopeMap);
      break;

    // ----- Declarations (non-scope-creating) -----

    case "VariableDeclaration":
      visitVariableDeclaration(node, scope, scopeMap);
      break;

    // ----- All other nodes: generic child traversal -----

    default:
      visitChildren(node, scope, scopeMap);
      break;
  }
}

function visitStatements(
  stmts: (Statement | ModuleDeclaration | Directive)[],
  scope: Scope,
  scopeMap: ScopeMap,
): void {
  // Hoist function declarations first (like JS does).
  // Per §10.2.11 step 29, collect in reverse order so the last declaration
  // of each name wins, then reverse back to get spec initialization order.
  const seenFunctionNames = new Set<string>();
  const functionsReversed: Function[] = [];
  for (let i = stmts.length - 1; i >= 0; i--) {
    const fn = extractFunctionDeclaration(stmts[i]);
    if (fn?.id) {
      registerBinding(fn.id.name, "function", scope);
      if (!seenFunctionNames.has(fn.id.name)) {
        seenFunctionNames.add(fn.id.name);
        functionsReversed.push(fn);
      }
    }
  }
  // Reverse back to get initialization order (last-wins, but executed
  // in the order they appear among the unique set).
  for (let i = functionsReversed.length - 1; i >= 0; i--) {
    scope.functionsToInitialize.push({ node: functionsReversed[i] });
  }

  // Hoist var declarations.
  for (const stmt of stmts) {
    hoistVars(stmt, scope);
  }

  // Collect lexical (let/const) and class declarations for the inventory.
  for (const stmt of stmts) {
    collectLexicalDeclarations(stmt, scope);
  }

  // Visit all statements.
  for (const stmt of stmts) {
    visitNode(stmt, scope, scopeMap);
  }
}

/** Extract a FunctionDeclaration from a statement, unwrapping exports. */
function extractFunctionDeclaration(
  stmt: Statement | ModuleDeclaration | Directive,
): Function | undefined {
  if (stmt.type === "FunctionDeclaration") return stmt;
  if (stmt.type === "ExportNamedDeclaration") {
    const decl = stmt.declaration;
    if (decl?.type === "FunctionDeclaration") return decl;
  }
  if (stmt.type === "ExportDefaultDeclaration") {
    const decl = stmt.declaration;
    if (decl.type === "FunctionDeclaration") return decl;
  }
  return undefined;
}

/** Collect let/const/class declarations into the scope's inventories. */
function collectLexicalDeclarations(
  stmt: Statement | ModuleDeclaration | Directive,
  scope: Scope,
): void {
  let node: Statement | Declaration;

  if (stmt.type === "ExportNamedDeclaration") {
    const decl = stmt.declaration;
    if (decl) node = decl;
    else return;
  } else if (stmt.type === "ExportDefaultDeclaration") {
    const decl = stmt.declaration;
    if (decl.type === "ClassDeclaration") {
      scope.classDeclarations.push({ node: decl });
    }
    return;
  } else {
    node = stmt;
  }

  if (node.type === "VariableDeclaration" && (node.kind === "let" || node.kind === "const")) {
    scope.lexicalDeclarations.push({ kind: node.kind, node });
  } else if (node.type === "ClassDeclaration") {
    scope.classDeclarations.push({ node });
  }
}

/** Hoists `var` declarations to the given scope (function/program scope). */
function hoistVars(node: Node, scope: Scope): void {
  switch (node.type) {
    case "VariableDeclaration":
      if (node.kind === "var") {
        for (const decl of node.declarations) {
          collectBindingNames(decl.id, "var", scope);
        }
        scope.varDeclarations.push({ node });
      }
      break;
    case "ForStatement":
      if (node.init?.type === "VariableDeclaration" && node.init.kind === "var") {
        for (const decl of node.init.declarations) {
          collectBindingNames(decl.id, "var", scope);
        }
        scope.varDeclarations.push({ node: node.init });
      }
      if (node.body) hoistVars(node.body, scope);
      break;
    case "ForInStatement":
    case "ForOfStatement":
      if (node.left.type === "VariableDeclaration" && node.left.kind === "var") {
        for (const decl of node.left.declarations) {
          collectBindingNames(decl.id, "var", scope);
        }
        scope.varDeclarations.push({ node: node.left });
      }
      if (node.body) hoistVars(node.body, scope);
      break;
    case "BlockStatement":
      for (const child of node.body) {
        hoistVars(child, scope);
      }
      break;
    case "LabeledStatement":
      hoistVars(node.body, scope);
      break;
    case "IfStatement":
      hoistVars(node.consequent, scope);
      if (node.alternate) hoistVars(node.alternate, scope);
      break;
    case "SwitchStatement":
      for (const c of node.cases) {
        for (const s of c.consequent) hoistVars(s, scope);
      }
      break;
    case "TryStatement":
      hoistVars(node.block, scope);
      if (node.handler) hoistVars(node.handler.body, scope);
      if (node.finalizer) hoistVars(node.finalizer, scope);
      break;
    case "WhileStatement":
    case "DoWhileStatement":
      hoistVars(node.body, scope);
      break;
    case "WithStatement":
      hoistVars(node.body, scope);
      break;
    case "ExportNamedDeclaration": {
      const decl = node.declaration;
      if (decl) hoistVars(decl, scope);
      break;
    }
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      break;
    default:
      break;
  }
}

function visitFunction(
  node: Function | ArrowFunctionExpression,
  parentScope: Scope,
  scopeMap: ScopeMap,
): void {
  const funcScope = new Scope(parentScope, "function");
  scopeMap.set(node, funcScope);

  for (const param of node.params) {
    collectBindingNames(param, "param", funcScope);
  }

  // Named function expression: the name is bound inside the function scope.
  if (node.type === "FunctionExpression" && node.id) {
    registerBinding(node.id.name, "function", funcScope);
  }

  if (node.body) {
    if (node.body.type === "BlockStatement") {
      // Don't create a new block scope for the function body — the function
      // scope IS the body scope.
      scopeMap.set(node.body, funcScope);
      visitStatements(node.body.body, funcScope, scopeMap);
    } else {
      // Arrow with expression body.
      visitNode(node.body, funcScope, scopeMap);
    }
  }
}

function visitVariableDeclaration(
  node: VariableDeclaration,
  scope: Scope,
  scopeMap: ScopeMap,
): void {
  // var is already hoisted; let/const register in current scope.
  if (node.kind === "let" || node.kind === "const") {
    for (const decl of node.declarations) {
      collectBindingNames(decl.id, node.kind, scope);
    }
    // Add to inventory if not already added by collectLexicalDeclarations
    // (e.g., for-loop init declarations visited through visitNode).
    if (!scope.lexicalDeclarations.some((d) => d.node === node)) {
      scope.lexicalDeclarations.push({ kind: node.kind, node });
    }
  }

  for (const decl of node.declarations) {
    if (decl.init) {
      visitNode(decl.init, scope, scopeMap);
    }
  }
}

function visitForStatement(node: ForStatement, scope: Scope, scopeMap: ScopeMap): void {
  if (
    node.init?.type === "VariableDeclaration" &&
    (node.init.kind === "let" || node.init.kind === "const")
  ) {
    const forScope = new Scope(scope, "block");
    scopeMap.set(node, forScope);
    visitNode(node.init, forScope, scopeMap);
    if (node.test) visitNode(node.test, forScope, scopeMap);
    if (node.update) visitNode(node.update, forScope, scopeMap);
    if (node.body) visitNode(node.body, forScope, scopeMap);
  } else {
    // for (var ...) or for (;;) — no new scope, just traverse children.
    if (node.init) visitNode(node.init, scope, scopeMap);
    if (node.test) visitNode(node.test, scope, scopeMap);
    if (node.update) visitNode(node.update, scope, scopeMap);
    if (node.body) visitNode(node.body, scope, scopeMap);
  }
}

function visitForInOfStatement(
  node: ForInStatement | ForOfStatement,
  scope: Scope,
  scopeMap: ScopeMap,
): void {
  if (
    node.left.type === "VariableDeclaration" &&
    (node.left.kind === "let" || node.left.kind === "const")
  ) {
    const forScope = new Scope(scope, "block");
    scopeMap.set(node, forScope);
    visitNode(node.left, forScope, scopeMap);
    visitNode(node.right, scope, scopeMap);
    if (node.body) visitNode(node.body, forScope, scopeMap);
  } else {
    // for (x in ...) with var or bare assignment — no new scope.
    visitNode(node.left, scope, scopeMap);
    visitNode(node.right, scope, scopeMap);
    if (node.body) visitNode(node.body, scope, scopeMap);
  }
}

function visitSwitchStatement(node: SwitchStatement, scope: Scope, scopeMap: ScopeMap): void {
  const switchScope = new Scope(scope, "block");
  scopeMap.set(node, switchScope);
  visitNode(node.discriminant, scope, scopeMap);

  // In module/strict mode, function declarations in switch cases are
  // block-scoped to the switch scope (BlockDeclarationInstantiation §14.2.2),
  // not hoisted to the enclosing function scope (Annex B sloppy behavior).
  const seenFunctionNames = new Set<string>();
  const allCaseStmts = node.cases.flatMap((c) => c.consequent);
  for (let i = allCaseStmts.length - 1; i >= 0; i--) {
    const stmt = allCaseStmts[i];
    if (stmt.type === "FunctionDeclaration" && stmt.id) {
      registerBinding(stmt.id.name, "function", switchScope);
      if (!seenFunctionNames.has(stmt.id.name)) {
        seenFunctionNames.add(stmt.id.name);
        switchScope.functionsToInitialize.push({ node: stmt });
      }
    }
  }
  // Reverse to get spec initialization order (last-wins among unique names).
  switchScope.functionsToInitialize.reverse();

  // Hoist var declarations to the enclosing function/program scope.
  for (const c of node.cases) {
    for (const stmt of c.consequent) {
      hoistVars(stmt, scope);
    }
  }

  // Collect lexical declarations for the switch scope.
  for (const c of node.cases) {
    for (const stmt of c.consequent) {
      collectLexicalDeclarations(stmt, switchScope);
    }
  }

  for (const c of node.cases) {
    if (c.test) visitNode(c.test, switchScope, scopeMap);
    for (const stmt of c.consequent) {
      visitNode(stmt, switchScope, scopeMap);
    }
  }
}

function visitCatchClause(node: CatchClause, scope: Scope, scopeMap: ScopeMap): void {
  const catchScope = new Scope(scope, "block");
  scopeMap.set(node, catchScope);
  if (node.param) {
    collectBindingNames(node.param, "catch", catchScope);
  }
  scopeMap.set(node.body, catchScope);
  visitStatements(node.body.body, catchScope, scopeMap);
}

// -----------------------------------------------------------------------
// Binding name collection from patterns
// -----------------------------------------------------------------------

function collectBindingNames(
  pattern: AST.Pattern | MemberExpression,
  kind: BindingKind,
  scope: Scope,
): void {
  switch (pattern.type) {
    case "Identifier":
      registerBinding(pattern.name, kind, scope);
      break;
    case "ArrayPattern":
      for (const el of pattern.elements) {
        if (el) collectBindingNames(el, kind, scope);
      }
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          collectBindingNames(prop.argument, kind, scope);
        } else {
          collectBindingNames(prop.value, kind, scope);
        }
      }
      break;
    case "AssignmentPattern":
      collectBindingNames(pattern.left, kind, scope);
      break;
    case "RestElement":
      collectBindingNames(pattern.argument, kind, scope);
      break;
    default:
      break;
  }
}

function registerBinding(name: string, kind: BindingKind, scope: Scope): void {
  const target =
    kind === "var"
      ? scope.kind === "function" || scope.kind === "program"
        ? scope
        : (scope.getFunctionParent() ?? scope.getProgramParent())
      : scope;

  if (!target.bindings.has(name)) {
    target.bindings.set(name, {
      kind,
      scope: target,
      mutations: [],
      references: [],
    });
  }
}

// -----------------------------------------------------------------------
// Phase 2: Reference and mutation collection (explicit visitors)
// -----------------------------------------------------------------------

function collectReferences(node: Node, scope: Scope, scopeMap: ScopeMap): void {
  switch (node.type) {
    // ----- Value: handled by callers via collectRefFromExpr -----
    case "Identifier":
      return;

    // ----- Scope-entering nodes (must resolve correct scope) -----

    case "Program": {
      const progScope = scopeMap.get(node) ?? scope;
      for (const stmt of node.body) {
        collectReferences(stmt, progScope, scopeMap);
      }
      return;
    }

    case "BlockStatement": {
      const blockScope = scopeMap.get(node) ?? scope;
      for (const stmt of node.body) {
        collectReferences(stmt, blockScope, scopeMap);
      }
      return;
    }

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const fnScope = scopeMap.get(node) ?? scope;
      for (const param of node.params) {
        collectDefaultValueReferences(param, fnScope, scopeMap);
      }
      if (node.body) {
        if (node.body.type === "BlockStatement") {
          for (const stmt of node.body.body) {
            collectReferences(stmt, fnScope, scopeMap);
          }
        } else {
          collectRefFromExpr(node.body, fnScope, scopeMap);
        }
      }
      return;
    }

    case "ClassExpression": {
      const classScope = scopeMap.get(node) ?? scope;
      if (node.superClass) {
        collectRefFromExpr(node.superClass, scope, scopeMap);
      }
      if (node.body) {
        collectReferences(node.body, classScope, scopeMap);
      }
      return;
    }

    case "ClassDeclaration": {
      const classBodyScope = scopeMap.get(node.body) ?? scope;
      if (node.superClass) {
        collectRefFromExpr(node.superClass, scope, scopeMap);
      }
      if (node.body) {
        collectReferences(node.body, classBodyScope, scopeMap);
      }
      return;
    }

    case "ForStatement": {
      const forScope = scopeMap.get(node) ?? scope;
      if (node.init) {
        if (node.init.type === "VariableDeclaration") {
          collectReferences(node.init, forScope, scopeMap);
        } else {
          collectRefFromExpr(node.init, forScope, scopeMap);
        }
      }
      if (node.test) collectRefFromExpr(node.test, forScope, scopeMap);
      if (node.update) collectRefFromExpr(node.update, forScope, scopeMap);
      if (node.body) collectReferences(node.body, forScope, scopeMap);
      return;
    }

    case "ForInStatement":
    case "ForOfStatement": {
      const forInScope = scopeMap.get(node) ?? scope;
      if (node.left.type === "VariableDeclaration") {
        collectReferences(node.left, forInScope, scopeMap);
      } else {
        collectMutationFromPattern(node.left as AST.Pattern, scope, scopeMap);
      }
      collectRefFromExpr(node.right, scope, scopeMap);
      collectReferences(node.body, forInScope, scopeMap);
      return;
    }

    case "SwitchStatement": {
      const switchScope = scopeMap.get(node) ?? scope;
      collectRefFromExpr(node.discriminant, scope, scopeMap);
      for (const c of node.cases) {
        if (c.test) collectRefFromExpr(c.test, switchScope, scopeMap);
        for (const stmt of c.consequent) {
          collectReferences(stmt, switchScope, scopeMap);
        }
      }
      return;
    }

    case "CatchClause": {
      const catchScope = scopeMap.get(node) ?? scope;
      collectReferences(node.body, catchScope, scopeMap);
      return;
    }

    // ----- Reference/mutation-sensitive nodes -----

    case "AssignmentExpression": {
      if (node.operator !== "=") {
        collectRefFromExpr(node.left as Expression, scope, scopeMap);
      }
      collectMutationFromPattern(node.left, scope, scopeMap);
      collectRefFromExpr(node.right, scope, scopeMap);
      return;
    }

    case "UpdateExpression": {
      if (node.argument.type === "Identifier") {
        addMutation(node.argument, scope);
        addReference(node.argument, scope);
      } else {
        collectRefFromExpr(node.argument, scope, scopeMap);
      }
      return;
    }

    case "MemberExpression": {
      collectRefFromExpr(node.object, scope, scopeMap);
      if (node.computed) {
        collectRefFromExpr(node.property, scope, scopeMap);
      }
      return;
    }

    case "Property": {
      if (node.computed) {
        collectRefFromExpr(node.key as Expression, scope, scopeMap);
      }
      collectReferences(node.value, scope, scopeMap);
      return;
    }

    case "VariableDeclarator": {
      collectDefaultValueReferences(node.id, scope, scopeMap);
      if (node.init) collectRefFromExpr(node.init, scope, scopeMap);
      return;
    }

    case "MethodDefinition":
    case "PropertyDefinition": {
      if (node.computed && node.key.type !== "PrivateIdentifier") {
        collectRefFromExpr(node.key as Expression, scope, scopeMap);
      }
      if (node.value) {
        collectReferences(node.value, scope, scopeMap);
      }
      return;
    }

    case "ExportNamedDeclaration": {
      if (node.declaration) {
        collectReferences(node.declaration, scope, scopeMap);
      }
      for (const spec of node.specifiers) {
        if (spec.local.type === "Identifier") {
          addReference(spec.local, scope);
        }
      }
      return;
    }

    case "ExportDefaultDeclaration": {
      const decl = node.declaration;
      if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
        collectReferences(decl, scope, scopeMap);
      } else {
        collectRefFromExpr(decl, scope, scopeMap);
      }
      return;
    }

    // ----- JSX name resolution -----

    case "JSXOpeningElement": {
      collectJSXNameReferences(node.name, scope);
      for (const attr of node.attributes) {
        collectReferences(attr, scope, scopeMap);
      }
      return;
    }

    case "JSXMemberExpression": {
      collectJSXNameReferences(node.object, scope);
      return;
    }

    // ----- All other nodes: generic child traversal -----

    default:
      collectReferencesChildren(node, scope, scopeMap);
      return;
  }
}

/** Collect references from default values in patterns (not the bindings themselves). */
function collectDefaultValueReferences(
  pattern: AST.Pattern,
  scope: Scope,
  scopeMap: ScopeMap,
): void {
  switch (pattern.type) {
    case "AssignmentPattern":
      collectRefFromExpr(pattern.right, scope, scopeMap);
      collectDefaultValueReferences(pattern.left, scope, scopeMap);
      break;
    case "ArrayPattern":
      for (const el of pattern.elements) {
        if (el) collectDefaultValueReferences(el, scope, scopeMap);
      }
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          collectDefaultValueReferences(prop.argument, scope, scopeMap);
        } else {
          if (prop.computed) {
            collectRefFromExpr(prop.key as Expression, scope, scopeMap);
          }
          collectDefaultValueReferences(prop.value as AST.Pattern, scope, scopeMap);
        }
      }
      break;
    case "RestElement":
      collectDefaultValueReferences(pattern.argument, scope, scopeMap);
      break;
    default:
      break;
  }
}

function collectRefFromExpr(node: Node, scope: Scope, scopeMap: ScopeMap): void {
  if (node.type === "Identifier") {
    addReference(node as AST.Value, scope);
    return;
  }
  collectReferences(node, scope, scopeMap);
}

function collectMutationFromPattern(
  node: AST.Pattern | MemberExpression,
  scope: Scope,
  scopeMap: ScopeMap,
): void {
  switch (node.type) {
    case "Identifier":
      addMutation(node, scope);
      break;
    case "ArrayPattern":
      for (const el of node.elements) {
        if (el) collectMutationFromPattern(el, scope, scopeMap);
      }
      break;
    case "ObjectPattern":
      for (const prop of node.properties) {
        if (prop.type === "RestElement") {
          collectMutationFromPattern(prop.argument, scope, scopeMap);
        } else {
          collectMutationFromPattern(prop.value, scope, scopeMap);
        }
      }
      break;
    case "AssignmentPattern":
      collectMutationFromPattern(node.left, scope, scopeMap);
      collectRefFromExpr(node.right, scope, scopeMap);
      break;
    case "MemberExpression":
      collectRefFromExpr(node, scope, scopeMap);
      break;
    default:
      break;
  }
}

/** Resolve a JSX element name to variable references (e.g., <Foo.Bar /> → reference to Foo). */
function collectJSXNameReferences(node: JSXElementName, scope: Scope): void {
  if (node.type === "JSXIdentifier") {
    const { name } = node;
    // Only uppercase JSX names are component references; lowercase are HTML tags.
    if (name[0] && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
      const binding = scope.getBinding(name);
      if (binding) {
        binding.references.push({ node: node as unknown as AST.Value, scope });
      }
    }
  } else if (node.type === "JSXMemberExpression") {
    collectJSXNameReferences(node.object, scope);
  }
}

function addReference(id: AST.Value, scope: Scope): void {
  const binding = scope.getBinding(id.name);
  if (binding) {
    binding.references.push({ node: id, scope });
  }
}

function addMutation(id: AST.Value, scope: Scope): void {
  const binding = scope.getBinding(id.name);
  if (binding) {
    binding.mutations.push({ node: id, scope });
  }
}

/** ClassHeritage uses `heritageScope`; ClassBody uses `bodyScope` (per ECMA-262). */
function visitClassBody(
  node: Class,
  heritageScope: Scope,
  bodyScope: Scope,
  scopeMap: ScopeMap,
): void {
  if (node.superClass) visitNode(node.superClass, heritageScope, scopeMap);
  if (node.body) visitNode(node.body, bodyScope, scopeMap);
}

// -----------------------------------------------------------------------
// Generic child traversal using eslint-visitor-keys
// -----------------------------------------------------------------------

function visitChildren(node: Node, scope: Scope, scopeMap: ScopeMap): void {
  const keys = KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = (node as unknown as Record<string, unknown>)[key];
    if (child == null) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && typeof (item as Node).type === "string") {
          visitNode(item as Node, scope, scopeMap);
        }
      }
    } else if (typeof child === "object" && typeof (child as Node).type === "string") {
      visitNode(child as Node, scope, scopeMap);
    }
  }
}

function collectReferencesChildren(node: Node, scope: Scope, scopeMap: ScopeMap): void {
  const keys = KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = (node as unknown as Record<string, unknown>)[key];
    if (child == null) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && typeof (item as Node).type === "string") {
          const childNode = item as Node;
          if (childNode.type === "Identifier") {
            addReference(childNode as AST.Value, scope);
          } else {
            collectReferences(childNode, scope, scopeMap);
          }
        }
      }
    } else if (typeof child === "object" && typeof (child as Node).type === "string") {
      const childNode = child as Node;
      if (childNode.type === "Identifier") {
        addReference(childNode as AST.Value, scope);
      } else {
        collectReferences(childNode, scope, scopeMap);
      }
    }
  }
}
