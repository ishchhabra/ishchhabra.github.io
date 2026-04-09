import type { Identifier } from "./Identifier";
import { Place } from "./Place";

export type DestructureBindingStorage = "local" | "context";

export interface DestructureBindingTarget {
  kind: "binding";
  place: Place;
  storage: DestructureBindingStorage;
}

export interface DestructureStaticMemberTarget {
  kind: "static-member";
  object: Place;
  property: string | number;
  optional: boolean;
}

export interface DestructureDynamicMemberTarget {
  kind: "dynamic-member";
  object: Place;
  property: Place;
  optional: boolean;
}

export interface DestructureAssignmentTarget {
  kind: "assignment";
  left: DestructureTarget;
  right: Place;
}

export interface DestructureRestTarget {
  kind: "rest";
  argument: DestructureTarget;
}

export interface DestructureObjectProperty {
  key: string | number | Place;
  computed: boolean;
  shorthand: boolean;
  value: DestructureTarget;
}

export interface ArrayDestructureTarget {
  kind: "array";
  elements: Array<DestructureTarget | null>;
}

export interface ObjectDestructureTarget {
  kind: "object";
  properties: DestructureObjectProperty[];
}

export type DestructureTarget =
  | DestructureBindingTarget
  | DestructureStaticMemberTarget
  | DestructureDynamicMemberTarget
  | DestructureAssignmentTarget
  | DestructureRestTarget
  | ArrayDestructureTarget
  | ObjectDestructureTarget;

export function getDestructureTargetOperands(target: DestructureTarget): Place[] {
  switch (target.kind) {
    case "binding":
      return [];
    case "static-member":
      return [target.object];
    case "dynamic-member":
      return [target.object, target.property];
    case "assignment":
      return [...getDestructureTargetOperands(target.left), target.right];
    case "rest":
      return getDestructureTargetOperands(target.argument);
    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : getDestructureTargetOperands(element),
      );
    case "object":
      return target.properties.flatMap((property) => [
        ...(property.computed && property.key instanceof Place ? [property.key] : []),
        ...getDestructureTargetOperands(property.value),
      ]);
  }
}

export function getDestructureTargetDefs(target: DestructureTarget): Place[] {
  switch (target.kind) {
    case "binding":
      return target.storage === "local" ? [target.place] : [];
    case "static-member":
    case "dynamic-member":
      return [];
    case "assignment":
      return getDestructureTargetDefs(target.left);
    case "rest":
      return getDestructureTargetDefs(target.argument);
    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : getDestructureTargetDefs(element),
      );
    case "object":
      return target.properties.flatMap((property) => getDestructureTargetDefs(property.value));
  }
}

export function destructureTargetHasObservableWrites(target: DestructureTarget): boolean {
  switch (target.kind) {
    case "binding":
      return target.storage === "context";
    case "static-member":
    case "dynamic-member":
      return true;
    case "assignment":
      return destructureTargetHasObservableWrites(target.left);
    case "rest":
      return destructureTargetHasObservableWrites(target.argument);
    case "array":
      return target.elements.some(
        (element) => element !== null && destructureTargetHasObservableWrites(element),
      );
    case "object":
      return target.properties.some((property) => destructureTargetHasObservableWrites(property.value));
  }
}

export function rewriteDestructureTarget(
  target: DestructureTarget,
  values: Map<Identifier, Place>,
  { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
): DestructureTarget {
  switch (target.kind) {
    case "binding":
      return {
        ...target,
        place: rewriteDefinitions ? target.place.rewrite(values) : target.place,
      };
    case "static-member":
      return {
        ...target,
        object: target.object.rewrite(values),
      };
    case "dynamic-member":
      return {
        ...target,
        object: target.object.rewrite(values),
        property: target.property.rewrite(values),
      };
    case "assignment":
      return {
        ...target,
        left: rewriteDestructureTarget(target.left, values, { rewriteDefinitions }),
        right: target.right.rewrite(values),
      };
    case "rest":
      return {
        ...target,
        argument: rewriteDestructureTarget(target.argument, values, { rewriteDefinitions }),
      };
    case "array":
      return {
        ...target,
        elements: target.elements.map((element) =>
          element === null
            ? null
            : rewriteDestructureTarget(element, values, { rewriteDefinitions }),
        ),
      };
    case "object":
      return {
        ...target,
        properties: target.properties.map((property) => ({
          ...property,
          key:
            property.computed && property.key instanceof Place
              ? property.key.rewrite(values)
              : property.key,
          value: rewriteDestructureTarget(property.value, values, { rewriteDefinitions }),
        })),
      };
  }
}
