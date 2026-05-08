declare const opaquePrivateNameId: unique symbol;

export type PrivateNameId = number & {
  readonly [opaquePrivateNameId]: "PrivateNameId";
};

export function makePrivateNameId(id: number): PrivateNameId {
  return id as PrivateNameId;
}

/**
 * Lexically scoped ECMAScript private name.
 *
 * The source name is only for printing. The id is the semantic brand identity,
 * so two classes can both declare `#x` without sharing the same private slot.
 */
export interface PrivateName {
  readonly id: PrivateNameId;
  readonly name: string;
}
