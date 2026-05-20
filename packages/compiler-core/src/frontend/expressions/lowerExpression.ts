import {
  AwaitExpression,
  BinaryExpression,
  ChainExpression,
  Expression,
  NewExpression,
  SequenceExpression,
  TaggedTemplateExpression,
  UpdateExpression,
  ImportExpression,
  JSXElement,
  JSXFragment,
  YieldExpression,
} from "oxc-parser";

import { Value } from "../../ir/core/Value";
import { lowerClass } from "../classes/lowerClass";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerArrayExpression } from "./lowerArrayExpression";
import { lowerAssignmentExpression } from "./lowerAssignmentExpression";
import { lowerAwaitExpression } from "./lowerAwaitExpression";
import { lowerBinaryExpression } from "./lowerBinaryExpression";
import { lowerCallExpression } from "./lowerCallExpression";
import { lowerConditionalExpression } from "./lowerConditionalExpression";
import { lowerArrowFunctionExpression, lowerFunctionExpression } from "./lowerFunctionExpression";
import { lowerIdentifier } from "./lowerIdentifier";
import { lowerImportExpression } from "./lowerImportExpression";
import { lowerJSXElement, lowerJSXFragment } from "./lowerJSXExpression";
import { lowerLiteral } from "./lowerLiteral";
import { lowerLogicalExpression } from "./lowerLogicalExpression";
import { lowerMemberExpression } from "./lowerMemberExpression";
import { lowerMetaProperty } from "./lowerMetaProperty";
import { lowerNewExpression } from "./lowerNewExpression";
import { lowerObjectExpression } from "./lowerObjectExpression";
import { lowerOptionalChain } from "./lowerOptionalChain";
import { lowerRegExpLiteral } from "./lowerRegExpLiteral";
import { lowerSequenceExpression } from "./lowerSequenceExpression";
import { lowerTaggedTemplateExpression } from "./lowerTaggedTemplateExpression";
import { lowerTemplateLiteral } from "./lowerTemplateLiteral";
import { lowerThisExpression } from "./lowerThisExpression";
import { lowerUnaryExpression } from "./lowerUnaryExpression";
import { lowerUpdateExpression } from "./lowerUpdateExpression";
import { lowerYieldExpression } from "./lowerYieldExpression";

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

    case "TaggedTemplateExpression":
      return lowerTaggedTemplateExpression(builder, expression as TaggedTemplateExpression);

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
