import * as t from "@babel/types";
import {
  ArrayExpressionOp,
  BinaryExpressionOp,
  CallExpressionOp,
  ClassMethodOp,
  ClassPropertyOp,
  ConditionalExpressionOp,
  HoleOp,
  LiteralOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ObjectMethodOp,
  ObjectPropertyOp,
  SequenceExpressionOp,
  TemplateLiteralOp,
  UnaryExpressionOp,
} from "../../../../ir";
import type { ValueOp } from "../../../../ir/categories";
import { ImportExpressionOp } from "../../../../ir/ops/call/ImportExpression";
import { FuncOp } from "../../../../ir/core/FuncOp";
import { RegExpLiteralOp } from "../../../../ir/ops/prim/RegExpLiteral";
import { ArrowFunctionExpressionOp } from "../../../../ir/ops/func/ArrowFunctionExpression";
import { AwaitExpressionOp } from "../../../../ir/ops/call/AwaitExpression";
import { FunctionExpressionOp } from "../../../../ir/ops/func/FunctionExpression";
import { TaggedTemplateExpressionOp } from "../../../../ir/ops/call/TaggedTemplateExpression";
import { MetaPropertyOp } from "../../../../ir/ops/prop/MetaProperty";
import { ThisExpressionOp } from "../../../../ir/ops/prop/ThisExpression";
import { ClassExpressionOp } from "../../../../ir/ops/class/ClassExpression";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateArrayExpressionOp } from "./generateArrayExpression";
import { generateClassExpressionOp } from "./generateClassExpression";
import { generateClassMethodOp } from "./generateClassMethod";
import { generateClassPropertyOp } from "./generateClassProperty";
import { generateAwaitExpressionOp } from "./generateAwaitExpression";
import { generateArrowFunctionExpressionOp } from "./generateArrowFunctionExpression";
import { generateBinaryExpressionOp } from "./generateBinaryExpression";
import { generateCallExpression } from "./generateCallExpression";
import { generateConditionalExpressionOp } from "./generateConditionalExpression";
import { generateFunctionExpressionOp } from "./generateFunctionExpression";
import { generateHoleOp } from "./generateHole";
import { generateImportExpressionOp } from "./generateImportExpression";
import { generateLiteralOp } from "./generateLiteral";
import { generateMetaPropertyOp } from "./generateMetaProperty";
import { generateNewExpressionOp } from "./generateNewExpression";
import { generateObjectExpressionOp } from "./generateObjectExpression";
import { generateObjectMethodOp } from "./generateObjectMethod";
import { generateObjectPropertyOp } from "./generateObjectProperty";
import { generateRegExpLiteralOp } from "./generateRegExpLiteral";
import { generateSequenceExpressionOp } from "./generateSequenceExpression";
import { generateTemplateLiteralOp } from "./generateTemplateLiteral";
import { generateThisExpressionOp } from "./generateThisExpression";
import { generateTaggedTemplateExpressionOp } from "./generateTaggedTemplateExpression";
import { generateUnaryExpressionOp } from "./generateUnaryExpression";
import { SuperCallOp } from "../../../../ir/ops/call/SuperCall";
import { SuperPropertyOp } from "../../../../ir/ops/prop/SuperProperty";
import { YieldExpressionOp } from "../../../../ir/ops/call/YieldExpression";
import { generateSuperCallOp } from "./generateSuperCall";
import { generateSuperPropertyOp } from "./generateSuperProperty";
import { generateYieldExpressionOp } from "./generateYieldExpression";

export function generateValueOp(
  instruction: ValueOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): t.Expression | t.ObjectMethod | t.ObjectProperty | t.ClassMethod | t.ClassProperty | null {
  if (instruction instanceof ClassExpressionOp) {
    return generateClassExpressionOp(instruction, generator);
  } else if (instruction instanceof ClassMethodOp) {
    return generateClassMethodOp(instruction, generator);
  } else if (instruction instanceof ClassPropertyOp) {
    return generateClassPropertyOp(instruction, generator);
  } else if (instruction instanceof ConditionalExpressionOp) {
    return generateConditionalExpressionOp(instruction, generator);
  } else if (instruction instanceof ArrayExpressionOp) {
    return generateArrayExpressionOp(instruction, generator);
  } else if (instruction instanceof AwaitExpressionOp) {
    return generateAwaitExpressionOp(instruction, generator);
  } else if (instruction instanceof ArrowFunctionExpressionOp) {
    return generateArrowFunctionExpressionOp(instruction, generator);
  } else if (instruction instanceof BinaryExpressionOp) {
    return generateBinaryExpressionOp(instruction, generator);
  } else if (instruction instanceof CallExpressionOp) {
    return generateCallExpression(instruction, generator);
  } else if (instruction instanceof FunctionExpressionOp) {
    return generateFunctionExpressionOp(instruction, generator);
  } else if (instruction instanceof HoleOp) {
    return generateHoleOp(instruction, generator);
  } else if (instruction instanceof ImportExpressionOp) {
    return generateImportExpressionOp(instruction, generator);
  } else if (instruction instanceof LiteralOp) {
    return generateLiteralOp(instruction, generator);
  } else if (instruction instanceof MetaPropertyOp) {
    return generateMetaPropertyOp(instruction, generator);
  } else if (instruction instanceof NewExpressionOp) {
    return generateNewExpressionOp(instruction, generator);
  } else if (instruction instanceof RegExpLiteralOp) {
    return generateRegExpLiteralOp(instruction, generator);
  } else if (instruction instanceof ObjectExpressionOp) {
    return generateObjectExpressionOp(instruction, generator);
  } else if (instruction instanceof ObjectMethodOp) {
    return generateObjectMethodOp(instruction, generator);
  } else if (instruction instanceof ObjectPropertyOp) {
    return generateObjectPropertyOp(instruction, generator);
  } else if (instruction instanceof SequenceExpressionOp) {
    return generateSequenceExpressionOp(instruction, generator);
  } else if (instruction instanceof TemplateLiteralOp) {
    return generateTemplateLiteralOp(instruction, generator);
  } else if (instruction instanceof ThisExpressionOp) {
    return generateThisExpressionOp(instruction, generator);
  } else if (instruction instanceof TaggedTemplateExpressionOp) {
    return generateTaggedTemplateExpressionOp(instruction, generator);
  } else if (instruction instanceof UnaryExpressionOp) {
    return generateUnaryExpressionOp(instruction, generator);
  } else if (instruction instanceof SuperCallOp) {
    return generateSuperCallOp(instruction, generator);
  } else if (instruction instanceof SuperPropertyOp) {
    return generateSuperPropertyOp(instruction, generator);
  } else if (instruction instanceof YieldExpressionOp) {
    return generateYieldExpressionOp(instruction, generator);
  }

  throw new Error(
    `Unsupported value type: ${(instruction as { constructor: { name: string } }).constructor.name}`,
  );
}
