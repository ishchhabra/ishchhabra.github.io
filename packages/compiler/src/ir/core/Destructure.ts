import { Value } from "./Value";

export type DestructureBindingStorage = "local" | "context";

export interface DestructureBindingTarget {
  kind: "binding";
  place: Value;
  storage: DestructureBindingStorage;
}

export interface DestructureStaticMemberTarget {
  kind: "static-member";
  object: Value;
  property: string | number;
  optional: boolean;
}

export interface DestructureDynamicMemberTarget {
  kind: "dynamic-member";
  object: Value;
  property: Value;
  optional: boolean;
}

export interface DestructureAssignmentTarget {
  kind: "assignment";
  left: DestructureTarget;
  right: Value;
}

export interface DestructureRestTarget {
  kind: "rest";
  argument: DestructureTarget;
}

export interface DestructureObjectProperty {
  key: string | number | Value;
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

export function destructureTargetOperands(target: DestructureTarget): Value[] {
  switch (target.kind) {
    case "binding":
      return [];
    case "static-member":
      return [target.object];
    case "dynamic-member":
      return [target.object, target.property];
    case "assignment":
      return [...destructureTargetOperands(target.left), target.right];
    case "rest":
      return destructureTargetOperands(target.argument);
    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : destructureTargetOperands(element),
      );
    case "object":
      return target.properties.flatMap((property) => [
        ...(property.computed && property.key instanceof Value ? [property.key] : []),
        ...destructureTargetOperands(property.value),
      ]);
  }
}

export function destructureTargetResults(target: DestructureTarget): Value[] {
  switch (target.kind) {
    case "binding":
      return target.storage === "local" ? [target.place] : [];
    case "static-member":
    case "dynamic-member":
      return [];
    case "assignment":
      return destructureTargetResults(target.left);
    case "rest":
      return destructureTargetResults(target.argument);
    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : destructureTargetResults(element),
      );
    case "object":
      return target.properties.flatMap((property) => destructureTargetResults(property.value));
  }
}

/**
 * Collect every binding-leaf place in a destructure target tree,
 * including bindings with `storage: "context"`. This is the wider
 * analog of {@link destructureTargetResults}, which filters out
 * context bindings because they don't participate in SSA rename as
 * ordinary local defs.
 *
 * Used by {@link FuncOp} consumers that need every place the
 * destructure produces regardless of storage — e.g., rename-stack
 * seeding for function parameters, and "places owned by this
 * function" scans.
 */
export function collectDestructureTargetBindingPlaces(target: DestructureTarget): Value[] {
  switch (target.kind) {
    case "binding":
      return [target.place];
    case "static-member":
    case "dynamic-member":
      return [];
    case "assignment":
      return collectDestructureTargetBindingPlaces(target.left);
    case "rest":
      return collectDestructureTargetBindingPlaces(target.argument);
    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : collectDestructureTargetBindingPlaces(element),
      );
    case "object":
      return target.properties.flatMap((property) =>
        collectDestructureTargetBindingPlaces(property.value),
      );
  }
}

export function destructureTargetHasObservableWrites(target: DestructureTarget): boolean {
  switch (target.kind) {
    case "binding":
      // Both storage kinds are observable — the write binds a
      // source-level variable readable by subsequent code. The
      // pre-mem2reg convention relied on DCE keeping destructures
      // alive via LoadLocal use-chains; post-mem2reg those chains
      // get elided, so destructures must self-declare their effect.
      return true;
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
      return target.properties.some((property) =>
        destructureTargetHasObservableWrites(property.value),
      );
  }
}

export function rewriteDestructureTarget(
  target: DestructureTarget,
  values: Map<Value, Value>,
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
            property.computed && property.key instanceof Value
              ? property.key.rewrite(values)
              : property.key,
          value: rewriteDestructureTarget(property.value, values, { rewriteDefinitions }),
        })),
      };
  }
}

export function printDestructureTarget(target: DestructureTarget): string {
  switch (target.kind) {
    case "binding":
      return target.place.print();
    case "static-member":
      return `${target.object.print()}.${String(target.property)}`;
    case "dynamic-member":
      return `${target.object.print()}[${target.property.print()}]`;
    case "assignment":
      return `${printDestructureTarget(target.left)} = ${target.right.print()}`;
    case "rest":
      return `...${printDestructureTarget(target.argument)}`;
    case "array":
      return `[${target.elements
        .map((element) => (element === null ? "<hole>" : printDestructureTarget(element)))
        .join(", ")}]`;
    case "object":
      return `{${target.properties
        .map((property) => {
          if (property.value.kind === "rest") {
            return `...${printDestructureTarget(property.value.argument)}`;
          }
          let keyLabel: string;
          if (property.computed && property.key instanceof Value) {
            keyLabel = `[${property.key.print()}]`;
          } else if (typeof property.key === "number") {
            keyLabel = String(property.key);
          } else if (typeof property.key === "string") {
            keyLabel = property.key;
          } else {
            keyLabel = property.key.print();
          }
          return `${keyLabel}: ${printDestructureTarget(property.value)}`;
        })
        .join(", ")}}`;
  }
}
