import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ExpressionStatementInstruction, Place } from "../../../ir";
import { LoadDynamicPropertyInstruction } from "../../../ir/instructions/memory/LoadDynamicProperty";
import { LoadStaticPropertyInstruction } from "../../../ir/instructions/memory/LoadStaticProperty";
import { StoreDynamicPropertyInstruction } from "../../../ir/instructions/memory/StoreDynamicProperty";
import { StoreStaticPropertyInstruction } from "../../../ir/instructions/memory/StoreStaticProperty";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
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

/**
 * Check if a member expression has a statically resolvable key.
 * In ESTree: non-computed keys, or computed keys that are string/number literals.
 */
function isStaticMemberAccess(node: ESTree.MemberExpression): boolean {
  if (!node.computed) {
    return true;
  }

  const prop = node.property;
  if (
    prop.type === "Literal" &&
    (typeof prop.value === "string" || typeof prop.value === "number")
  ) {
    return true;
  }

  return false;
}

/**
 * Extract the value from a static property key node.
 */
function getValueFromStaticKey(
  node: ESTree.Expression | ESTree.PrivateIdentifier,
): string | number | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (
    node.type === "Literal" &&
    (typeof node.value === "string" || typeof node.value === "number")
  ) {
    return node.value;
  }
  return undefined;
}

export function buildMemberReference(
  node: ESTree.MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  { reusable = false }: { reusable?: boolean } = {},
): MemberReference {
  const builtObjectPlace = buildNode(
    node.object,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (builtObjectPlace === undefined || Array.isArray(builtObjectPlace)) {
    throw new Error("Member expression object must be a single place");
  }

  const objectPlace = reusable
    ? stabilizePlace(builtObjectPlace, functionBuilder, environment)
    : builtObjectPlace;
  // In ESTree, optional chaining sets `optional: true` on the MemberExpression itself.
  const optional = node.optional === true;
  const property = node.property;

  if (isStaticMemberAccess(node)) {
    return {
      kind: "static",
      object: objectPlace,
      property: String(getValueFromStaticKey(property)),
      optional,
    };
  }

  if (property.type === "PrivateIdentifier") {
    throw new Error("PrivateIdentifier is not supported in member expressions");
  }

  const builtPropertyPlace = buildNode(
    property,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (builtPropertyPlace === undefined || Array.isArray(builtPropertyPlace)) {
    throw new Error("Member expression property must be a single place");
  }

  return {
    kind: "dynamic",
    object: objectPlace,
    property: reusable
      ? stabilizePlace(builtPropertyPlace, functionBuilder, environment)
      : builtPropertyPlace,
    optional,
  };
}

export function createLoadMemberReferenceInstruction(
  reference: MemberReference,
  place: Place,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createInstruction(
      LoadStaticPropertyInstruction,
      place,
      reference.object,
      reference.property,
      reference.optional,
    );
  }

  return environment.createInstruction(
    LoadDynamicPropertyInstruction,
    place,
    reference.object,
    reference.property,
    reference.optional,
  );
}

export function loadMemberReference(
  reference: MemberReference,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createLoadMemberReferenceInstruction(reference, place, environment),
  );
  return place;
}

export function createStoreMemberReferenceInstruction(
  reference: MemberReference,
  place: Place,
  valuePlace: Place,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createInstruction(
      StoreStaticPropertyInstruction,
      place,
      reference.object,
      reference.property,
      valuePlace,
    );
  }

  return environment.createInstruction(
    StoreDynamicPropertyInstruction,
    place,
    reference.object,
    reference.property,
    valuePlace,
  );
}

export function storeMemberReference(
  reference: MemberReference,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createStoreMemberReferenceInstruction(reference, place, valuePlace, environment),
  );
  return place;
}

export function emitMemberReferenceStore(
  reference: MemberReference,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const storePlace = storeMemberReference(reference, valuePlace, functionBuilder, environment);
  functionBuilder.addInstruction(
    environment.createInstruction(
      ExpressionStatementInstruction,
      environment.createPlace(environment.createIdentifier()),
      storePlace,
    ),
  );
  return storePlace;
}
