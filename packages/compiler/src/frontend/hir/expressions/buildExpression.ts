import type { Expression, RegExpLiteral } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildAwaitExpression } from "./buildAwaitExpression";
import { buildArrayExpression } from "./buildArrayExpression";
import { buildArrowFunctionExpression } from "./buildArrowFunctionExpression";
import { buildAssignmentExpression } from "./buildAssignmentExpression";
import { buildBinaryExpression } from "./buildBinaryExpression";
import { buildCallExpression } from "./buildCallExpression";
import { buildClassExpression } from "./buildClassExpression";
import { buildConditionalExpression } from "./buildConditionalExpression";
import { buildFunctionExpression } from "./buildFunctionExpression";
import { buildLiteral } from "./buildLiteral";
import { buildLogicalExpression } from "./buildLogicalExpression";
import { buildMemberExpression } from "./buildMemberExpression";
import { buildMetaProperty } from "./buildMetaProperty";
import { buildNewExpression } from "./buildNewExpression";
import { buildObjectExpression } from "./buildObjectExpression";
import { buildRegExpLiteral } from "./buildRegExpLiteral";
import { buildSequenceExpression } from "./buildSequenceExpression";
import { buildTaggedTemplateExpression } from "./buildTaggedTemplateExpression";
import { buildTemplateLiteral } from "./buildTemplateLiteral";
import { buildUnaryExpression } from "./buildUnaryExpression";
import { buildThisExpression } from "./buildThisExpression";
import { buildUpdateExpression } from "./buildUpdateExpression";
import { buildYieldExpression } from "./buildYieldExpression";
import { buildImportExpression } from "./buildImportExpression";

export function buildExpression(
  node: Expression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  switch (node.type) {
    case "AwaitExpression":
      return buildAwaitExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "AssignmentExpression":
      return buildAssignmentExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ArrayExpression":
      return buildArrayExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ArrowFunctionExpression":
      return buildArrowFunctionExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "BinaryExpression":
      return buildBinaryExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "CallExpression":
      return buildCallExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ClassExpression":
      return buildClassExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ConditionalExpression":
      return buildConditionalExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "FunctionExpression":
      return buildFunctionExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "LogicalExpression":
      return buildLogicalExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "MemberExpression":
      return buildMemberExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "MetaProperty":
      return buildMetaProperty(node, functionBuilder, environment);
    case "NewExpression":
      return buildNewExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ObjectExpression":
      return buildObjectExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "SequenceExpression":
      return buildSequenceExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "TemplateLiteral":
      return buildTemplateLiteral(node, scope, functionBuilder, moduleBuilder, environment);
    case "ThisExpression":
      return buildThisExpression(node, functionBuilder, environment);
    case "TaggedTemplateExpression":
      return buildTaggedTemplateExpression(
        node,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    case "UnaryExpression":
      return buildUnaryExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "UpdateExpression":
      return buildUpdateExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "YieldExpression":
      return buildYieldExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "ChainExpression": {
      // ESTree wraps optional chaining in ChainExpression.
      // Unwrap and dispatch to the appropriate builder.
      const inner = node.expression;
      if (inner.type === "CallExpression") {
        return buildCallExpression(inner, scope, functionBuilder, moduleBuilder, environment);
      }
      if (inner.type === "MemberExpression") {
        return buildMemberExpression(inner, scope, functionBuilder, moduleBuilder, environment);
      }
      throw new Error(
        `Unsupported ChainExpression inner type: ${(inner as { type: string }).type}`,
      );
    }
    case "ImportExpression":
      return buildImportExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "Literal": {
      if ("regex" in node) {
        return buildRegExpLiteral(node as RegExpLiteral, functionBuilder, environment);
      }
      return buildLiteral(node, functionBuilder, environment);
    }
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}
