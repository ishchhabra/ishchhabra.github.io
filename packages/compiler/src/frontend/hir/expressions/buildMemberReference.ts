import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { isStaticMemberAccess } from "../../../babel-utils";
import { Environment } from "../../../environment";
import { ExpressionStatementInstruction, Place } from "../../../ir";
import { LoadDynamicPropertyInstruction } from "../../../ir/instructions/memory/LoadDynamicProperty";
import { LoadStaticPropertyInstruction } from "../../../ir/instructions/memory/LoadStaticProperty";
import { StoreDynamicPropertyInstruction } from "../../../ir/instructions/memory/StoreDynamicProperty";
import { StoreStaticPropertyInstruction } from "../../../ir/instructions/memory/StoreStaticProperty";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getValueFromStaticKey } from "../getValueFromStaticKey";
import { stabilizePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export type MemberReference =
  | {
      kind: "static";
      object: Place;
      property: string;
      optional: boolean;
    }
  | {
      kind: "dynamic";
      object: Place;
      property: Place;
      optional: boolean;
    };

export function buildMemberReference(
  nodePath: NodePath<t.MemberExpression | t.OptionalMemberExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  { reusable = false }: { reusable?: boolean } = {},
): MemberReference {
  const objectPath = nodePath.get("object");
  const builtObjectPlace = buildNode(objectPath, functionBuilder, moduleBuilder, environment);
  if (builtObjectPlace === undefined || Array.isArray(builtObjectPlace)) {
    throw new Error("Member expression object must be a single place");
  }

  const objectPlace = reusable
    ? stabilizePlace(builtObjectPlace, nodePath, functionBuilder, environment)
    : builtObjectPlace;
  const optional = nodePath.isOptionalMemberExpression() && nodePath.node.optional;
  const propertyPath: NodePath<t.MemberExpression["property"]> = nodePath.get("property");
  propertyPath.assertExpression();

  if (isStaticMemberAccess(nodePath)) {
    return {
      kind: "static",
      object: objectPlace,
      property: String(getValueFromStaticKey(propertyPath)),
      optional,
    };
  }

  const builtPropertyPlace = buildNode(propertyPath, functionBuilder, moduleBuilder, environment);
  if (builtPropertyPlace === undefined || Array.isArray(builtPropertyPlace)) {
    throw new Error("Member expression property must be a single place");
  }

  return {
    kind: "dynamic",
    object: objectPlace,
    property: reusable
      ? stabilizePlace(builtPropertyPlace, nodePath, functionBuilder, environment)
      : builtPropertyPlace,
    optional,
  };
}

export function createLoadMemberReferenceInstruction<T extends t.Node>(
  reference: MemberReference,
  place: Place,
  nodePath: NodePath<T> | undefined,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createInstruction(
      LoadStaticPropertyInstruction,
      place,
      nodePath,
      reference.object,
      reference.property,
      reference.optional,
    );
  }

  return environment.createInstruction(
    LoadDynamicPropertyInstruction,
    place,
    nodePath,
    reference.object,
    reference.property,
    reference.optional,
  );
}

export function loadMemberReference<T extends t.Node>(
  reference: MemberReference,
  nodePath: NodePath<T> | undefined,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createLoadMemberReferenceInstruction(reference, place, nodePath, environment),
  );
  return place;
}

export function createStoreMemberReferenceInstruction<T extends t.Node>(
  reference: MemberReference,
  place: Place,
  nodePath: NodePath<T> | undefined,
  valuePlace: Place,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createInstruction(
      StoreStaticPropertyInstruction,
      place,
      nodePath,
      reference.object,
      reference.property,
      valuePlace,
    );
  }

  return environment.createInstruction(
    StoreDynamicPropertyInstruction,
    place,
    nodePath,
    reference.object,
    reference.property,
    valuePlace,
  );
}

export function storeMemberReference<T extends t.Node>(
  reference: MemberReference,
  nodePath: NodePath<T> | undefined,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createStoreMemberReferenceInstruction(reference, place, nodePath, valuePlace, environment),
  );
  return place;
}

export function emitMemberReferenceStore<T extends t.Node>(
  reference: MemberReference,
  nodePath: NodePath<T> | undefined,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const storePlace = storeMemberReference(
    reference,
    nodePath,
    valuePlace,
    functionBuilder,
    environment,
  );
  functionBuilder.addInstruction(
    environment.createInstruction(
      ExpressionStatementInstruction,
      environment.createPlace(environment.createIdentifier()),
      nodePath,
      storePlace,
    ),
  );
  return storePlace;
}
