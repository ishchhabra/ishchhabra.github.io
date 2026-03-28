import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BindingIdentifierInstruction,
  LiteralInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { PendingRenames } from "./buildBindings";
import { isContextVariable } from "./isContextVariable";

export function buildVariableDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const parentPath = nodePath.parentPath;
  const isHoistable =
    nodePath.node.kind === "var" && !hasInterveningFunction(nodePath, bindingsPath);
  if (!parentPath.isExportDeclaration() && parentPath !== bindingsPath && !isHoistable) {
    return;
  }

  const declarationPaths = nodePath.get("declarations");
  for (const declarationPath of declarationPaths) {
    const id = declarationPath.get("id") as NodePath<t.LVal>;
    buildLValBindings(bindingsPath, id, functionBuilder, environment, pendingRenames);
  }
}

function buildLValBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.LVal | t.ObjectProperty>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  switch (nodePath.type) {
    case "Identifier":
      nodePath.assertIdentifier();
      buildIdentifierBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    case "ArrayPattern":
      nodePath.assertArrayPattern();
      buildArrayPatternBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    case "AssignmentPattern":
      nodePath.assertAssignmentPattern();
      buildAssignmentPatternBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    case "ObjectPattern":
      nodePath.assertObjectPattern();
      buildObjectPatternBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    case "ObjectProperty":
      nodePath.assertObjectProperty();
      buildObjectPropertyBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    case "RestElement":
      nodePath.assertRestElement();
      buildRestElementBindings(bindingsPath, nodePath, functionBuilder, environment, pendingRenames);
      break;
    default:
      throw new Error(`Unsupported LVal type: ${nodePath.type}`);
  }
}

function buildIdentifierBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.Identifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const originalName = nodePath.node.name;

  // Skip if already registered in the enclosing function (or program)
  // scope — a hoisted var processed by an earlier buildBindings call.
  // Check that scope's own data directly rather than using getData()
  // which walks the entire scope chain and would incorrectly match a
  // same-named declaration from an enclosing function.
  const functionScope =
    bindingsPath.scope.getFunctionParent() ?? bindingsPath.scope.getProgramParent();
  if (functionScope.data[originalName] !== undefined) return;

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, bindingsPath);

  // Mark context variables before renaming so SSA can skip them.
  const binding = bindingsPath.scope.getBinding(originalName);
  if (binding && isContextVariable(binding, bindingsPath)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  // Collect rename for batch application instead of calling scope.rename()
  // per-variable (which does O(AST) traversal each time).
  if (pendingRenames) {
    pendingRenames.push([originalName, identifier.name]);
  } else {
    bindingsPath.scope.rename(originalName, identifier.name);
  }
  functionBuilder.registerDeclarationName(identifier.name, identifier.declarationId, bindingsPath);

  const place = environment.createPlace(identifier);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );

  // Emit hoisted `const <binding> = undefined` for var declarations.
  if (binding?.kind === "var") {
    const hoistId = environment.createIdentifier(identifier.declarationId);
    const hoistPlace = environment.createPlace(hoistId);
    functionBuilder.addInstruction(
      environment.createInstruction(BindingIdentifierInstruction, hoistPlace, nodePath),
    );
    const undefPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, undefPlace, nodePath, undefined),
    );
    const storePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        storePlace,
        nodePath,
        hoistPlace,
        undefPlace,
        "const" as const,
        [],
      ),
    );
    environment.registerDeclaration(
      identifier.declarationId,
      functionBuilder.currentBlock.id,
      hoistPlace.id,
    );
  }
}

function buildArrayPatternBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.ArrayPattern>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const elementsPath: NodePath<t.ArrayPattern["elements"][number]>[] = nodePath.get("elements");
  for (const elementPath of elementsPath) {
    if (!elementPath.hasNode()) {
      continue;
    }

    elementPath.assertLVal();
    buildLValBindings(bindingsPath, elementPath, functionBuilder, environment, pendingRenames);
  }
}

function buildAssignmentPatternBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.AssignmentPattern>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const leftPath = nodePath.get("left");
  buildLValBindings(bindingsPath, leftPath, functionBuilder, environment, pendingRenames);
}

function buildObjectPatternBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.ObjectPattern>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const propertiesPath = nodePath.get("properties");
  for (const propertyPath of propertiesPath) {
    if (!(propertyPath.isLVal() || propertyPath.isObjectProperty())) {
      throw new Error(`Unsupported property type: ${propertyPath.type}`);
    }

    buildLValBindings(bindingsPath, propertyPath, functionBuilder, environment, pendingRenames);
  }
}

function buildObjectPropertyBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.ObjectProperty>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const valuePath = nodePath.get("value");
  if (!(valuePath.isLVal() || valuePath.isObjectProperty())) {
    throw new Error(`Unsupported property type: ${valuePath.type}`);
  }

  buildLValBindings(bindingsPath, valuePath, functionBuilder, environment, pendingRenames);
}

function buildRestElementBindings(
  bindingsPath: NodePath,
  nodePath: NodePath<t.RestElement>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const elementPath = nodePath.get("argument");
  buildLValBindings(bindingsPath, elementPath, functionBuilder, environment, pendingRenames);
}

function hasInterveningFunction(nodePath: NodePath, bindingsPath: NodePath): boolean {
  let current = nodePath.parentPath;
  while (current && current !== bindingsPath) {
    if (current.isFunction()) return true;
    current = current.parentPath;
  }

  return false;
}
