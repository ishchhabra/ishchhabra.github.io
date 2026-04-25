import type * as AST from "../../estree";
import type { VariableDeclaration, VariableDeclarator } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  BindingDeclOp,
  BindingInitOp,
  LiteralOp,
  ObjectDestructureOp,
  Value,
  StoreContextOp,
  StoreLocalOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { buildNode } from "../buildNode";

export function buildVariableDeclaration(
  node: VariableDeclaration,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value | Value[] | undefined {
  const kind = node.kind;
  if (kind !== "var" && kind !== "let" && kind !== "const") {
    throw new Error(`Unsupported variable declaration kind: ${kind}`);
  }

  const declarations = node.declarations;
  const declarationPlaces = declarations.map((declaration: VariableDeclarator) => {
    const id = declaration.id;
    const init = declaration.init;

    const target = buildLVal(
      id as AST.Pattern,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      { kind: "declaration", declarationKind: kind },
    );
    const place = environment.createValue();

    if (init == null && target.kind === "binding" && kind !== "var" && target.storage === "local") {
      if (kind === "const") {
        throw new Error("Missing initializer in const declaration");
      }
      const instruction = environment.createOperation(BindingDeclOp, target.place, kind);
      functionBuilder.addOp(instruction);
      return instruction.place;
    }

    let valuePlace;
    if (init == null) {
      const undefinedPlace = environment.createValue();
      functionBuilder.addOp(environment.createOperation(LiteralOp, undefinedPlace, undefined));
      valuePlace = undefinedPlace;
    } else {
      valuePlace = buildNode(init, scope, functionBuilder, moduleBuilder, environment);
    }
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("Value place must be a single place");
    }

    if (target.kind === "binding") {
      if (kind !== "var" && target.storage === "local") {
        const instruction = environment.createOperation(
          BindingInitOp,
          target.place,
          kind,
          valuePlace,
        );
        functionBuilder.addOp(instruction);
        return instruction.place;
      }
      const instruction =
        target.storage === "context"
          ? environment.createOperation(
              StoreContextOp,
              place,
              target.place,
              valuePlace,
              "let",
              kind === "var" ? "assignment" : "declaration",
            )
          : environment.createOperation(StoreLocalOp, place, target.place, valuePlace);
      functionBuilder.addOp(instruction);
      return place;
    }

    if (target.kind === "array") {
      functionBuilder.addOp(
        environment.createOperation(
          ArrayDestructureOp,
          place,
          target.elements,
          valuePlace,
          "declaration",
          kind,
        ),
      );
      return place;
    }

    if (target.kind === "object") {
      functionBuilder.addOp(
        environment.createOperation(
          ObjectDestructureOp,
          place,
          target.properties,
          valuePlace,
          "declaration",
          kind,
        ),
      );
      return place;
    }

    throw new Error(`Unsupported declaration target: ${target.kind}`);
  });

  return declarationPlaces;
}
