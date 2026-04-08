import type * as AST from "../../estree";
import type { VariableDeclaration, VariableDeclarator } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place, StoreContextInstruction, StoreLocalInstruction } from "../../../ir";
import { LoadGlobalInstruction } from "../../../ir/instructions/memory/LoadGlobal";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { buildNode } from "../buildNode";

export function buildVariableDeclaration(
  node: VariableDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  const kind = node.kind;
  if (kind !== "var" && kind !== "let" && kind !== "const") {
    throw new Error(`Unsupported variable declaration kind: ${kind}`);
  }

  const declarations = node.declarations;
  const declarationPlaces = declarations.map((declaration: VariableDeclarator) => {
    const id = declaration.id;
    const init = declaration.init;

    let valuePlace;
    if (init == null) {
      // No initializer — emit LoadGlobal("undefined") instead of mutating the AST.
      const undefinedPlace = environment.createPlace(environment.createIdentifier());
      functionBuilder.addInstruction(
        environment.createInstruction(LoadGlobalInstruction, undefinedPlace, "undefined"),
      );
      valuePlace = undefinedPlace;
    } else {
      valuePlace = buildNode(init, scope, functionBuilder, moduleBuilder, environment);
    }
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("Value place must be a single place");
    }

    const { place: lvalPlace, bindings } = buildLVal(
      id as AST.Pattern,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );

    const isContext = bindings.some((p) =>
      environment.contextDeclarationIds.has(p.identifier.declarationId),
    );
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    // var declarations were already hoisted (DeclareLocal + StoreLocal/StoreContext
    // with undefined). The write here is an assignment to the existing binding,
    // not a new declaration.
    const contextKind = kind === "var" ? "assignment" : "declaration";
    const instruction = isContext
      ? environment.createInstruction(
          StoreContextInstruction,
          place,
          lvalPlace,
          valuePlace,
          "let",
          contextKind,
          bindings,
        )
      : environment.createInstruction(
          StoreLocalInstruction,
          place,
          lvalPlace,
          valuePlace,
          kind,
          bindings,
        );
    functionBuilder.addInstruction(instruction);
    return place;
  });

  return declarationPlaces;
}
