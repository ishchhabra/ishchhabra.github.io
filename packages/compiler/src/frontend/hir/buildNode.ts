import type * as AST from "../estree";
import type { ExportSpecifier, Node, SpreadElement } from "oxc-parser";
import { Environment } from "../../environment";
import { Place } from "../../ir";
import { isExpression, isJSX, isStatement, unwrapTSTypeWrappers } from "../estree";
import { type Scope } from "../scope/Scope";
import { buildExportSpecifier } from "./buildExportSpecifier";
import { buildIdentifier } from "./buildIdentifier";
import { buildObjectMethod } from "./buildObjectMethod";
import { buildObjectProperty } from "./buildObjectProperty";
import { buildSpreadElement } from "./buildSpreadElement";
import { buildHole } from "./expressions";
import { buildExpression } from "./expressions/buildExpression";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { buildJSX } from "./jsx/buildJSX";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildStatement } from "./statements/buildStatement";

export function buildNode(
  node: Node | null,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  if (node === null) {
    return buildHole(functionBuilder, environment);
  }

  // OXC with astType:"ts" emits TS type-wrapper nodes that are invisible
  // at runtime. Unwrap them to their inner expression before dispatching.
  const unwrapped = unwrapTSTypeWrappers(node);
  if (unwrapped !== node) {
    return buildNode(unwrapped, scope, functionBuilder, moduleBuilder, environment);
  }

  if (node.type === "Identifier") {
    return buildIdentifier(node, scope, functionBuilder, environment);
  }

  // ESTree represents object methods as Property nodes with method: true
  // or kind: "get" / "set"
  if (
    node.type === "Property" &&
    ((node as AST.Property).method || (node as AST.Property).kind !== "init")
  ) {
    return buildObjectMethod(
      node as AST.Property,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (node.type === "Property") {
    return buildObjectProperty(
      node as AST.Property,
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
      node as SpreadElement,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (node.type === "ExportSpecifier") {
    return buildExportSpecifier(
      node as ExportSpecifier,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error(`Unsupported node type: ${node.type}`);
}
