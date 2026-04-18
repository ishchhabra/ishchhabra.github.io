import type { Expression, MemberExpression, PrivateIdentifier } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { LoadDynamicPropertyOp } from "../../../ir/ops/prop/LoadDynamicProperty";
import { LoadStaticPropertyOp } from "../../../ir/ops/prop/LoadStaticProperty";
import { StoreDynamicPropertyOp } from "../../../ir/ops/prop/StoreDynamicProperty";
import { StoreStaticPropertyOp } from "../../../ir/ops/prop/StoreStaticProperty";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { stabilizePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export type MemberReference =
  | {
      kind: "static";
      object: Value;
      property: string;
      optional: boolean;
    }
  | {
      kind: "dynamic";
      object: Value;
      property: Value;
      optional: boolean;
    };

/**
 * Check if a member expression has a statically resolvable key.
 * In ESTree: non-computed keys, or computed keys that are string/number literals.
 */
function isStaticMemberAccess(node: MemberExpression): boolean {
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
function getValueFromStaticKey(node: Expression | PrivateIdentifier): string | number | undefined {
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
  node: MemberExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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
  place: Value,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createOperation(
      LoadStaticPropertyOp,
      place,
      reference.object,
      reference.property,
      reference.optional,
    );
  }

  return environment.createOperation(
    LoadDynamicPropertyOp,
    place,
    reference.object,
    reference.property,
    reference.optional,
  );
}

export function loadMemberReference(
  reference: MemberReference,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  functionBuilder.addOp(createLoadMemberReferenceInstruction(reference, place, environment));
  return place;
}

export function createStoreMemberReferenceInstruction(
  reference: MemberReference,
  place: Value,
  valuePlace: Value,
  environment: Environment,
) {
  if (reference.kind === "static") {
    return environment.createOperation(
      StoreStaticPropertyOp,
      place,
      reference.object,
      reference.property,
      valuePlace,
    );
  }

  return environment.createOperation(
    StoreDynamicPropertyOp,
    place,
    reference.object,
    reference.property,
    valuePlace,
  );
}

export function storeMemberReference(
  reference: MemberReference,
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  functionBuilder.addOp(
    createStoreMemberReferenceInstruction(reference, place, valuePlace, environment),
  );
  return place;
}

export function emitMemberReferenceStore(
  reference: MemberReference,
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  // The store instruction is already added by storeMemberReference.
  // Codegen will flush it as an expression statement if zero-use.
  return storeMemberReference(reference, valuePlace, functionBuilder, environment);
}
