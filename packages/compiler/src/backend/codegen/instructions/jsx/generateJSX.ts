import {
  JSXElementInstruction,
  JSXFragmentInstruction,
  JSXIdentifierInstruction,
  JSXInstruction,
  JSXMemberExpressionInstruction,
  JSXNamespacedNameInstruction,
  JSXTextInstruction,
} from "../../../../ir";
import { JSXAttributeInstruction } from "../../../../ir/instructions/jsx/JSXAttribute";
import { JSXClosingElementInstruction } from "../../../../ir/instructions/jsx/JSXClosingElement";
import { JSXClosingFragmentInstruction } from "../../../../ir/instructions/jsx/JSXClosingFragment";
import { JSXOpeningElementInstruction } from "../../../../ir/instructions/jsx/JSXOpeningElement";
import { JSXOpeningFragmentInstruction } from "../../../../ir/instructions/jsx/JSXOpeningFragment";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateJSXAttributeInstruction } from "./generateJSXAttribute";
import { generateJSXClosingElementInstruction } from "./generateJSXClosingElement";
import { generateJSXClosingFragmentInstruction } from "./generateJSXClosingFragment";
import { generateJSXElementInstruction } from "./generateJSXElement";
import { generateJSXFragmentInstruction } from "./generateJSXFragment";
import { generateJSXIdentifierInstruction } from "./generateJSXIdentifier";
import { generateJSXMemberExpressionInstruction } from "./generateJSXMemberExpression";
import { generateJSXNamespacedNameInstruction } from "./generateJSXNamespacedName";
import { generateJSXOpeningElementInstruction } from "./generateJSXOpeningElement";
import { generateJSXOpeningFragmentInstruction } from "./generateJSXOpeningFragment";
import { generateJSXTextInstruction } from "./generateJSXText";

export function generateJSXInstruction(instruction: JSXInstruction, generator: CodeGenerator) {
  if (instruction instanceof JSXElementInstruction) {
    return generateJSXElementInstruction(instruction, generator);
  } else if (instruction instanceof JSXFragmentInstruction) {
    return generateJSXFragmentInstruction(instruction, generator);
  } else if (instruction instanceof JSXTextInstruction) {
    return generateJSXTextInstruction(instruction, generator);
  } else if (instruction instanceof JSXAttributeInstruction) {
    return generateJSXAttributeInstruction(instruction, generator);
  } else if (instruction instanceof JSXOpeningElementInstruction) {
    return generateJSXOpeningElementInstruction(instruction, generator);
  } else if (instruction instanceof JSXClosingElementInstruction) {
    return generateJSXClosingElementInstruction(instruction, generator);
  } else if (instruction instanceof JSXOpeningFragmentInstruction) {
    return generateJSXOpeningFragmentInstruction(instruction, generator);
  } else if (instruction instanceof JSXClosingFragmentInstruction) {
    return generateJSXClosingFragmentInstruction(instruction, generator);
  } else if (instruction instanceof JSXIdentifierInstruction) {
    return generateJSXIdentifierInstruction(instruction, generator);
  } else if (instruction instanceof JSXMemberExpressionInstruction) {
    return generateJSXMemberExpressionInstruction(instruction, generator);
  } else if (instruction instanceof JSXNamespacedNameInstruction) {
    return generateJSXNamespacedNameInstruction(instruction, generator);
  }
}
