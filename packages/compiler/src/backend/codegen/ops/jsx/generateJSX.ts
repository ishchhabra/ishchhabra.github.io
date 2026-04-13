import {
  JSXElementOp,
  JSXFragmentOp,
  JSXIdentifierOp,
  JSXMemberExpressionOp,
  JSXNamespacedNameOp,
  JSXTextOp,
} from "../../../../ir";
import type { JSXOp } from "../../../../ir/categories";
import { JSXAttributeOp } from "../../../../ir/ops/jsx/JSXAttribute";
import { JSXSpreadAttributeOp } from "../../../../ir/ops/jsx/JSXSpreadAttribute";
import { JSXClosingElementOp } from "../../../../ir/ops/jsx/JSXClosingElement";
import { JSXClosingFragmentOp } from "../../../../ir/ops/jsx/JSXClosingFragment";
import { JSXOpeningElementOp } from "../../../../ir/ops/jsx/JSXOpeningElement";
import { JSXOpeningFragmentOp } from "../../../../ir/ops/jsx/JSXOpeningFragment";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateJSXAttributeOp } from "./generateJSXAttribute";
import { generateJSXSpreadAttributeOp } from "./generateJSXSpreadAttribute";
import { generateJSXClosingElementOp } from "./generateJSXClosingElement";
import { generateJSXClosingFragmentOp } from "./generateJSXClosingFragment";
import { generateJSXElementOp } from "./generateJSXElement";
import { generateJSXFragmentOp } from "./generateJSXFragment";
import { generateJSXIdentifierOp } from "./generateJSXIdentifier";
import { generateJSXMemberExpressionOp } from "./generateJSXMemberExpression";
import { generateJSXNamespacedNameOp } from "./generateJSXNamespacedName";
import { generateJSXOpeningElementOp } from "./generateJSXOpeningElement";
import { generateJSXOpeningFragmentOp } from "./generateJSXOpeningFragment";
import { generateJSXTextOp } from "./generateJSXText";

export function generateJSXOp(instruction: JSXOp, generator: CodeGenerator) {
  if (instruction instanceof JSXElementOp) {
    return generateJSXElementOp(instruction, generator);
  } else if (instruction instanceof JSXFragmentOp) {
    return generateJSXFragmentOp(instruction, generator);
  } else if (instruction instanceof JSXTextOp) {
    return generateJSXTextOp(instruction, generator);
  } else if (instruction instanceof JSXAttributeOp) {
    return generateJSXAttributeOp(instruction, generator);
  } else if (instruction instanceof JSXSpreadAttributeOp) {
    return generateJSXSpreadAttributeOp(instruction, generator);
  } else if (instruction instanceof JSXOpeningElementOp) {
    return generateJSXOpeningElementOp(instruction, generator);
  } else if (instruction instanceof JSXClosingElementOp) {
    return generateJSXClosingElementOp(instruction, generator);
  } else if (instruction instanceof JSXOpeningFragmentOp) {
    return generateJSXOpeningFragmentOp(instruction, generator);
  } else if (instruction instanceof JSXClosingFragmentOp) {
    return generateJSXClosingFragmentOp(instruction, generator);
  } else if (instruction instanceof JSXIdentifierOp) {
    return generateJSXIdentifierOp(instruction, generator);
  } else if (instruction instanceof JSXMemberExpressionOp) {
    return generateJSXMemberExpressionOp(instruction, generator);
  } else if (instruction instanceof JSXNamespacedNameOp) {
    return generateJSXNamespacedNameOp(instruction, generator);
  }
}
