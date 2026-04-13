/**
 * Simulated opaque type for IdentifierId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueIdentifierId = Symbol();
export type IdentifierId = number & { [opaqueIdentifierId]: "IdentifierId" };

export function makeIdentifierId(id: number): IdentifierId {
  return id as IdentifierId;
}

export function makeIdentifierName(declarationId: DeclarationId, version: number): string {
  return `$${declarationId}_${version}`;
}

/**
 * Simulated opaque type for DeclarationId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueDeclarationId = Symbol();
export type DeclarationId = number & { [opaqueDeclarationId]: "DeclarationId" };

export function makeDeclarationId(id: number): DeclarationId {
  return id as DeclarationId;
}

/**
 * An instruction, terminal, or structure that reads a place.
 *
 * This is the element type stored in {@link Identifier.uses}. The
 * constraint is intentionally structural (any object with
 * `getOperands()`) so that Operation, Operation, and
 * Operation all satisfy it without a circular import.
 */
export type User = {
  getOperands(): readonly { readonly identifier: Identifier }[];
};

export class Identifier {
  public name: string;

  /**
   * The instruction that defines (writes to) this identifier.
   * Maintained automatically by {@link BasicBlock} mutation methods.
   */
  public definer: User | undefined;

  /**
   * Embedded use-chain: the set of instructions, terminals, and
   * structures that read this identifier. Maintained automatically
   * by {@link BasicBlock} mutation methods.
   */
  public readonly uses: Set<User> = new Set();

  constructor(
    public readonly id: IdentifierId,
    public readonly version: string,
    public readonly declarationId: DeclarationId,
  ) {
    this.name = `$${this.declarationId}_${this.version}`;
  }
}
