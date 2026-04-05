import type * as ESTree from "estree";
import { Environment } from "../../environment";
import { Place } from "../../ir";
import { isExpression, isJSX, isPattern, isStatement, isTSOnlyNode } from "../estree";
import { type Scope } from "../scope/Scope";
import { buildExportSpecifier } from "./buildExportSpecifier";
import { buildIdentifier } from "./buildIdentifier";
import { buildObjectMethod } from "./buildObjectMethod";
import { buildObjectProperty } from "./buildObjectProperty";
import { buildSpreadElement } from "./buildSpreadElement";
import { buildHole } from "./expressions";
import { buildExpression } from "./expressions/buildExpression";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { buildJSX } from "./jsx/buildJSX";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildPattern } from "./patterns/buildPattern";
import { buildStatement } from "./statements/buildStatement";

export function buildNode(
  node: ESTree.Node | null,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  if (node === null) {
    return buildHole(functionBuilder, environment);
  }

  if (node.type === "Identifier") {
    return buildIdentifier(node, scope, functionBuilder, environment);
  }

  // ESTree represents object methods as Property nodes with method: true
  // or kind: "get" / "set"
  if (
    node.type === "Property" &&
    ((node as ESTree.Property).method || (node as ESTree.Property).kind !== "init")
  ) {
    return buildObjectMethod(
      node as ESTree.Property,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (node.type === "Property") {
    return buildObjectProperty(
      node as ESTree.Property,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (isJSX(node)) {
    return buildJSX(node as any, scope, functionBuilder, moduleBuilder, environment);
  }

  if (isExpression(node)) {
    return buildExpression(node, scope, functionBuilder, moduleBuilder, environment);
  }

  if (isStatement(node)) {
    return buildStatement(node, scope, functionBuilder, moduleBuilder, environment);
  }

  if (node.type === "SpreadElement") {
    return buildSpreadElement(
      node as ESTree.SpreadElement,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (isPattern(node)) {
    return buildPattern(node, scope, functionBuilder, moduleBuilder, environment);
  }

  if (node.type === "ExportSpecifier") {
    return buildExportSpecifier(
      node as ESTree.ExportSpecifier,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  // TS wrapper expressions (TSAsExpression, TSNonNullExpression, etc.)
  // have an `.expression` property containing the inner JS expression.
  // Other TS-only nodes (type aliases, interfaces, etc.) are skipped.
  if (isTSOnlyNode(node)) {
    if ("expression" in node) {
      return buildNode(
        (node as unknown as { expression: ESTree.Node }).expression,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    }
    return undefined;
  }

  throw new Error(`Unsupported node type: ${node.type}`);
}
