import {
  AwaitExpression,
  BinaryExpression,
  ChainExpression,
  Expression,
  NewExpression,
  SequenceExpression,
  UpdateExpression,
  ImportExpression,
  JSXElement,
  JSXFragment,
  YieldExpression,
} from "oxc-parser";
import { Value } from "../../ir/core/Value";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerAssignmentExpression } from "./lowerAssignmentExpression";
import { lowerBinaryExpression } from "./lowerBinaryExpression";
import { lowerCallExpression } from "./lowerCallExpression";
import { lowerArrowFunctionExpression, lowerFunctionExpression } from "./lowerFunctionExpression";
import { lowerIdentifier } from "./lowerIdentifier";
import { lowerLiteral } from "./lowerLiteral";
import { lowerUnaryExpression } from "./lowerUnaryExpression";
import { lowerMemberExpression } from "./lowerMemberExpression";
import { lowerLogicalExpression } from "./lowerLogicalExpression";
import { lowerArrayExpression } from "./lowerArrayExpression";
import { lowerObjectExpression } from "./lowerObjectExpression";
import { lowerConditionalExpression } from "./lowerConditionalExpression";
import { lowerSequenceExpression } from "./lowerSequenceExpression";
import { lowerThisExpression } from "./lowerThisExpression";
import { lowerUpdateExpression } from "./lowerUpdateExpression";
import { lowerNewExpression } from "./lowerNewExpression";
import { lowerMetaProperty } from "./lowerMetaProperty";
import { lowerRegExpLiteral } from "./lowerRegExpLiteral";
import { lowerTemplateLiteral } from "./lowerTemplateLiteral";
import { lowerImportExpression } from "./lowerImportExpression";
import { lowerAwaitExpression } from "./lowerAwaitExpression";
import { lowerYieldExpression } from "./lowerYieldExpression";
import { lowerOptionalChain } from "./lowerOptionalChain";
import { lowerClass } from "../classes/lowerClass";
import { lowerJSXElement, lowerJSXFragment } from "./lowerJSXExpression";

/**
 * Lowers an expression and returns the SSA value it produces.
 */
export function lowerExpression(builder: FunctionIRBuilder, expression: Expression): Value {
  switch (expression.type) {
    case "Literal":
      if ("regex" in expression) {
        return lowerRegExpLiteral(builder, expression);
      }

      return lowerLiteral(builder, expression);

    case "Identifier":
      return lowerIdentifier(builder, expression);

    case "ThisExpression":
      return lowerThisExpression(builder, expression);

    case "MetaProperty":
      return lowerMetaProperty(builder, expression);

    case "UnaryExpression":
      return lowerUnaryExpression(builder, expression);

    case "UpdateExpression":
      return lowerUpdateExpression(builder, expression as UpdateExpression);

    case "BinaryExpression":
      return lowerBinaryExpression(builder, expression as BinaryExpression);

    case "CallExpression":
      return lowerCallExpression(builder, expression);

    case "NewExpression":
      return lowerNewExpression(builder, expression as NewExpression);

    case "ArrayExpression":
      return lowerArrayExpression(builder, expression);

    case "ObjectExpression":
      return lowerObjectExpression(builder, expression);

    case "ChainExpression":
      return lowerChainExpression(builder, expression);

    case "FunctionExpression":
      return lowerFunctionExpression(builder, expression);

    case "ArrowFunctionExpression":
      return lowerArrowFunctionExpression(builder, expression);

    case "ClassExpression":
      return lowerClass(builder, expression);

    case "JSXElement":
      return lowerJSXElement(builder, expression as JSXElement);

    case "JSXFragment":
      return lowerJSXFragment(builder, expression as JSXFragment);

    case "AssignmentExpression":
      return lowerAssignmentExpression(builder, expression);

    case "MemberExpression":
      return lowerMemberExpression(builder, expression);

    case "LogicalExpression":
      return lowerLogicalExpression(builder, expression);

    case "ConditionalExpression":
      return lowerConditionalExpression(builder, expression);

    case "SequenceExpression":
      return lowerSequenceExpression(builder, expression as SequenceExpression);

    case "TemplateLiteral":
      return lowerTemplateLiteral(builder, expression);

    case "ImportExpression":
      return lowerImportExpression(builder, expression as ImportExpression);

    case "AwaitExpression":
      return lowerAwaitExpression(builder, expression as AwaitExpression);

    case "YieldExpression":
      return lowerYieldExpression(builder, expression as YieldExpression);

    case "ParenthesizedExpression":
      return lowerExpression(builder, expression.expression);

    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "TSInstantiationExpression":
      return lowerExpression(builder, expression.expression);

    default:
      throw new Error(`Unsupported expression type: ${expression.type}`);
  }
}

function lowerChainExpression(builder: FunctionIRBuilder, expression: ChainExpression): Value {
  return lowerOptionalChain(builder, expression);
}
