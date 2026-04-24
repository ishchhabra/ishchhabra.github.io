import type { ExportDefaultDeclaration } from "oxc-parser";
import { Environment } from "../../../environment";
import { ExportDefaultDeclarationOp, Operation } from "../../../ir";
import { FunctionDeclarationOp } from "../../../ir/ops/func/FunctionDeclaration";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { buildClassDeclaration } from "./buildClassDeclaration";
import { buildClassExpression } from "../expressions/buildClassExpression";
import { buildFunctionExpression } from "../expressions/buildFunctionExpression";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportDefaultDeclaration(
  node: ExportDefaultDeclaration,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const declaration = node.declaration;

  // Anonymous default function/class → expression builders. Named default
  // function is reused from the scope-instantiation hoisting; named
  // default class uses `buildClassDeclaration`. Codegen detects that
  // these declarations are claimed by the surrounding
  // `ExportDefaultDeclarationOp` via the use chain and suppresses
  // their standalone emission automatically.
  let declarationPlace;
  if (declaration.type === "FunctionDeclaration") {
    if (declaration.id === null) {
      declarationPlace = buildFunctionExpression(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    } else {
      const name = declaration.id.name;
      const declarationId = functionBuilder.getDeclarationId(name, scope);
      if (declarationId !== undefined) {
        const binding = environment.getDeclarationBinding(declarationId);
        const declarationInstruction = binding?.def;
        if (declarationInstruction instanceof FunctionDeclarationOp) {
          declarationPlace = declarationInstruction.place;
        }
      }
    }
  } else if (declaration.type === "ClassDeclaration") {
    if (declaration.id === null) {
      declarationPlace = buildClassExpression(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    } else {
      declarationPlace = buildClassDeclaration(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    }
  } else {
    declarationPlace = buildNode(declaration, scope, functionBuilder, moduleBuilder, environment);
  }

  if (declarationPlace === undefined || Array.isArray(declarationPlace)) {
    throw new Error("Export default declaration must be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ExportDefaultDeclarationOp,
    place,
    declarationPlace,
  );
  functionBuilder.addOp(instruction);

  // The op that defined `declarationPlace` is the exported declaration —
  // a FunctionDeclaration / ClassDeclaration for named default exports,
  // or the anonymous expression op otherwise.
  moduleBuilder.moduleIR.exports.set("default", {
    instruction,
    declaration: declarationPlace.def as Operation | undefined,
  });
  return place;
}
