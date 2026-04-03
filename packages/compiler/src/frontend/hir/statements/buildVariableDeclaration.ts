import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place, StoreContextInstruction, StoreLocalInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { buildNode } from "../buildNode";

export function buildVariableDeclaration(
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  const kind = nodePath.node.kind;
  if (kind !== "var" && kind !== "let" && kind !== "const") {
    throw new Error(`Unsupported variable declaration kind: ${kind}`);
  }

  const declarations = nodePath.get("declarations");
  const declarationPlaces = declarations.map((declaration: NodePath<t.VariableDeclarator>) => {
    const id = declaration.get("id");
    const init: NodePath<t.Expression | null | undefined> = declaration.get("init");

    if (!init.hasNode()) {
      init.replaceWith(t.identifier("undefined"));
      init.assertIdentifier({ name: "undefined" });
    }
    const valuePlace = buildNode(init, functionBuilder, moduleBuilder, environment);
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("Value place must be a single place");
    }

    const { place: lvalPlace, bindings } = buildLVal(
      id as NodePath<t.LVal>,
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
          nodePath,
          lvalPlace,
          valuePlace,
          "let",
          contextKind,
          bindings,
        )
      : environment.createInstruction(
          StoreLocalInstruction,
          place,
          nodePath,
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
