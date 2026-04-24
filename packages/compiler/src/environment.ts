import {
  BasicBlock,
  BlockId,
  type DeclarationKind,
  type DeclarationMetadata,
  makeBlockId,
  makeOperationId,
} from "./ir";
import { DeclarationId, makeDeclarationId, makeValueId, Value } from "./ir/core/Value";
import { ProjectEnvironment } from "./ProjectEnvironment";

// oxlint-disable-next-line typescript/no-explicit-any
type OmitFirst<T extends unknown[]> = T extends [any, ...infer Rest] ? Rest : never;

export class Environment {
  /**
   * Maps each `DeclarationId` to the SSA versions assigned to it, in
   * order of appearance. Used by the frontend to wire subsequent
   * reads of a declaration to its most recent SSA value.
   */
  declToValues: Map<DeclarationId, Array<{ blockId: BlockId; value: Value }>> = new Map();

  /**
   * Source-level metadata for each declaration, keyed by stable DeclarationId.
   * This is the authoritative source for declaration kind, source name, and
   * the stable binding value used by codegen.
   */
  declarationMetadata: Map<DeclarationId, DeclarationMetadata> = new Map();

  /**
   * Set of `DeclarationId`s for mutable variables that are captured and/or
   * mutated across closure boundaries ("context variables"). These are
   * excluded from SSA renaming and use dedicated Load/StoreContext ops.
   */
  contextDeclarationIds: Set<DeclarationId> = new Set();

  constructor(private readonly projectEnvironment: ProjectEnvironment) {}

  /** Proxy getters/setters — delegates to ProjectEnvironment for global uniqueness. */
  get nextDeclarationId() {
    return this.projectEnvironment.nextDeclarationId;
  }
  set nextDeclarationId(v: number) {
    this.projectEnvironment.nextDeclarationId = v;
  }
  get nextOperationId() {
    return this.projectEnvironment.nextOperationId;
  }
  set nextOperationId(v: number) {
    this.projectEnvironment.nextOperationId = v;
  }
  get nextValueId() {
    return this.projectEnvironment.nextValueId;
  }
  set nextValueId(v: number) {
    this.projectEnvironment.nextValueId = v;
  }

  /**
   * Allocate a fresh SSA {@link Value}. If `declarationId` is passed,
   * the new value carries that id (for subsequent SSA versions of an
   * existing declaration); otherwise a fresh declaration id is
   * allocated.
   */
  public createValue(declarationId?: DeclarationId): Value {
    declarationId ??= makeDeclarationId(this.projectEnvironment.nextDeclarationId++);
    const valueId = makeValueId(this.projectEnvironment.nextValueId++);
    return new Value(valueId, declarationId);
  }

  /**
   * Allocate a fresh op id and instantiate `Class` with it. This is a
   * thin convenience over `new Class(env.nextOperationId++, ...args)`;
   * use-list bookkeeping (operand uses, result definers, successor
   * block uses) happens in `op.attach(block)`, not here. Callers must
   * place the op in a block (or another IR owner) before its
   * def-use metadata is observable.
   */
  // oxlint-disable-next-line typescript/no-explicit-any
  public createOperation<C extends new (...args: any[]) => any>(
    Class: C,
    ...args: OmitFirst<ConstructorParameters<C>>
  ): InstanceType<C> {
    const opId = makeOperationId(this.projectEnvironment.nextOperationId++);
    return new Class(opId, ...args);
  }

  public createBlock(): BasicBlock {
    const blockId = makeBlockId(this.projectEnvironment.nextBlockId++);
    return new BasicBlock(blockId, [], undefined);
  }

  public registerDeclaration(declarationId: DeclarationId, blockId: BlockId, value: Value) {
    const entries = this.declToValues.get(declarationId) ?? [];
    entries.push({ blockId, value });
    this.declToValues.set(declarationId, entries);
  }

  public registerDeclarationMetadata(
    declarationId: DeclarationId,
    metadata: Pick<DeclarationMetadata, "kind" | "sourceName"> &
      Partial<Omit<DeclarationMetadata, "kind" | "sourceName">>,
  ) {
    const existing = this.declarationMetadata.get(declarationId);
    if (existing === undefined) {
      this.declarationMetadata.set(declarationId, { ...metadata });
      return;
    }

    existing.kind = metadata.kind;
    existing.sourceName = metadata.sourceName;
    if (metadata.funcOpId !== undefined) {
      existing.funcOpId = metadata.funcOpId;
    }
    if (metadata.bindingValue !== undefined) {
      existing.bindingValue = metadata.bindingValue;
    }
    if (metadata.scopeId !== undefined) {
      existing.scopeId = metadata.scopeId;
    }
    if (metadata.storage !== undefined) {
      existing.storage = metadata.storage;
    }
    if (metadata.import !== undefined) {
      existing.import = metadata.import;
    }
  }

  public getDeclarationMetadata(declarationId: DeclarationId): DeclarationMetadata | undefined {
    return this.declarationMetadata.get(declarationId);
  }

  public setDeclarationBinding(declarationId: DeclarationId, value: Value) {
    const metadata = this.declarationMetadata.get(declarationId);
    if (metadata === undefined) {
      throw new Error(`Declaration metadata not found for ${declarationId}`);
    }
    metadata.bindingValue = value;
  }

  public ensureSyntheticDeclarationMetadata(
    declarationId: DeclarationId,
    kind: Extract<DeclarationKind, "let" | "const" | "var" | "class">,
    bindingValue: Value,
  ) {
    if (!this.declarationMetadata.has(declarationId)) {
      this.registerDeclarationMetadata(declarationId, {
        kind,
        sourceName: bindingValue.name,
        bindingValue,
      });
      return;
    }

    const metadata = this.declarationMetadata.get(declarationId)!;
    if (metadata.bindingValue === undefined) {
      metadata.bindingValue = bindingValue;
    }
  }

  public getLatestDeclaration(declarationId: DeclarationId) {
    const entries = this.declToValues.get(declarationId) ?? [];
    return entries[entries.length - 1];
  }

  public getDeclarationBinding(declarationId: DeclarationId): Value | undefined {
    const metadata = this.declarationMetadata.get(declarationId);
    if (metadata?.bindingValue !== undefined) {
      return metadata.bindingValue;
    }
    const entries = this.declToValues.get(declarationId) ?? [];
    return entries[0]?.value;
  }
}
