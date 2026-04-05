import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { type Scope, type ScopeMap } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildClassDeclarationBindings } from "./buildClassDeclarationBindings";
import {
  initializeFunctionDeclaration,
  registerFunctionDeclarationBinding,
} from "./buildFunctionDeclarationBindings";
import { buildVariableDeclarationBindings } from "./buildVariableDeclarationBindings";

/**
 * Instantiates all bindings owned by the current scope before the
 * scope body is lowered. This mirrors JavaScript's environment creation
 * more closely than the old "discover declarations while traversing"
 * approach:
 * - function/program scope owns `var` and hoisted function declarations
 * - lexical scopes (block/switch/loop) own `let`/`const`/`class` and
 *   block-scoped function declarations
 *
 * Per ECMA-262 ss.10.2.11, instantiation proceeds in two phases:
 *   Phase 1 -- Create all bindings (var, let, const, class, function).
 *   Phase 2 -- InstantiateFunctionObject for each function declaration.
 * This ordering ensures function bodies can reference any binding in the
 * scope, even those declared after the function in source order.
 */
export function instantiateScopeBindings(
  bodyNode: ESTree.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  const scopeMap = functionBuilder.scopeMap;
  const pendingFunctionDeclarations: ESTree.FunctionDeclaration[] = [];

  // Phase 1: Create all bindings by walking into blocks but stopping at function boundaries.
  walkForDeclarations(bodyNode, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);

  // Phase 2: InstantiateFunctionObject for each function declaration.
  // All bindings are now registered, so function bodies can resolve
  // references to any declaration in the scope.
  for (const node of pendingFunctionDeclarations) {
    initializeFunctionDeclaration(scope, scopeMap, node, functionBuilder, environment, moduleBuilder);
  }
}

/**
 * Recursively walks the AST looking for declarations (ClassDeclaration,
 * FunctionDeclaration, VariableDeclaration) in the current scope. Walks
 * into block-like structures (BlockStatement, IfStatement, ForStatement,
 * etc.) but stops at function boundaries to avoid processing declarations
 * that belong to nested function scopes.
 */
function walkForDeclarations(
  node: ESTree.Node,
  scope: Scope,
  scopeMap: ScopeMap,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingFunctionDeclarations: ESTree.FunctionDeclaration[],
) {
  switch (node.type) {
    case "Program":
    case "BlockStatement":
    case "StaticBlock":
      for (const stmt of (node as ESTree.Program | ESTree.BlockStatement).body) {
        walkForDeclarations(stmt as ESTree.Node, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      break;

    case "ClassDeclaration":
      buildClassDeclarationBindings(scope, node, functionBuilder, environment);
      break;

    case "FunctionDeclaration":
      registerFunctionDeclarationBinding(scope, scopeMap, node, functionBuilder, environment);
      pendingFunctionDeclarations.push(node);
      // Do NOT recurse into the function body -- it has its own scope.
      break;

    case "VariableDeclaration":
      buildVariableDeclarationBindings(scope, node, functionBuilder, environment);
      break;

    // Walk into block-like structures but NOT into function boundaries.
    case "IfStatement":
      walkForDeclarations(node.consequent, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      if (node.alternate) {
        walkForDeclarations(node.alternate, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      break;

    case "ForStatement":
      if (node.init && node.init.type === "VariableDeclaration") {
        walkForDeclarations(node.init, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      walkForDeclarations(node.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      break;

    case "ForInStatement":
    case "ForOfStatement":
      if (node.left.type === "VariableDeclaration") {
        walkForDeclarations(node.left, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      walkForDeclarations(node.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      break;

    case "WhileStatement":
    case "DoWhileStatement":
      walkForDeclarations(node.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      break;

    case "SwitchStatement":
      for (const caseClause of node.cases) {
        for (const stmt of caseClause.consequent) {
          walkForDeclarations(stmt, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
        }
      }
      break;

    case "TryStatement":
      walkForDeclarations(node.block, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      if (node.handler) {
        walkForDeclarations(node.handler.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      if (node.finalizer) {
        walkForDeclarations(node.finalizer, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      break;

    case "WithStatement":
      walkForDeclarations(node.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      break;

    case "LabeledStatement":
      walkForDeclarations(node.body, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      break;

    case "ExportNamedDeclaration":
      if ((node as ESTree.ExportNamedDeclaration).declaration) {
        walkForDeclarations((node as ESTree.ExportNamedDeclaration).declaration!, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      break;

    case "ExportDefaultDeclaration":
      if (node.declaration && (node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration")) {
        walkForDeclarations(node.declaration as ESTree.FunctionDeclaration | ESTree.ClassDeclaration, scope, scopeMap, functionBuilder, environment, pendingFunctionDeclarations);
      }
      break;

    // Skip function expressions, arrow functions, class expressions --
    // these create their own scopes and are NOT declarations at this level.
    // Also skip all other expression/statement types that don't contain declarations.
    default:
      break;
  }
}
