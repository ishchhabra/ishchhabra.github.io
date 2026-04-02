import { Identifier } from "./Identifier";

/**
 * Simulated opaque type for PlaceId to prevent using normal numbers as ids
 * accidentally.
 */
const opaquePlaceId = Symbol();
export type PlaceId = number & { [opaquePlaceId]: "PlaceId" };

export function makePlaceId(id: number): PlaceId {
  return id as PlaceId;
}

/**
 * Represents a storage space in the intermediate representation (IR).
 */
export class Place {
  constructor(
    public readonly id: PlaceId,
    public readonly identifier: Identifier,
  ) {}

  rewrite(values: Map<Identifier, Place>): Place {
    return values.get(this.identifier) ?? this;
  }

  print(): string {
    return this.identifier.name ?? `$${this.identifier.declarationId}_${this.identifier.version}`;
  }
}
