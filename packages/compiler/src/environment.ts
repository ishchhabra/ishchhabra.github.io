import { castArray } from "lodash-es";
import {
  BasicBlock,
  BlockId,
  type DeclarationKind,
  type DeclarationMetadata,
  makeBlockId,
  makeOperationId,
  Operation,
  OperationId,
} from "./ir";
import {
  DeclarationId,
  Identifier,
  IdentifierId,
  makeDeclarationId,
  makeIdentifierId,
} from "./ir/core/Identifier";
import { makePlaceId, Place, PlaceId } from "./ir/core/Place";
import { ProjectEnvironment } from "./ProjectEnvironment";

// oxlint-disable-next-line typescript/no-explicit-any
type OmitFirst<T extends unknown[]> = T extends [any, ...infer Rest] ? Rest : never;

export class Environment {
  public readonly identifiers: Map<IdentifierId, Identifier> = new Map();
  public readonly places: Map<PlaceId, Place> = new Map();
  public readonly operations: Map<OperationId, Operation> = new Map();
  public readonly blocks: Map<BlockId, BasicBlock> = new Map();

  /**
   * Maps each `DeclarationId` (representing a declared variable or function name)
   * to an array of objects, where each object includes:
   * - `blockId`: the ID of the basic block in which this version of the declaration
   *   was assigned or updated
   * - `place`: the `Place` holding the (SSA) value for that version
   *
   * In an SSA-based IR, each new assignment to a declaration in a different block
   * or scope effectively creates a new "version" of that declaration, captured by
   * a distinct `Place`. This structure keeps track of those versions over time.
   */
  declToPlaces: Map<DeclarationId, Array<{ blockId: BlockId; placeId: PlaceId }>> = new Map();

  /**
   * Source-level metadata for each declaration, keyed by stable DeclarationId.
   * This is the authoritative source for declaration kind, source name, and
   * the stable binding place used by codegen.
   */
  declarationMetadata: Map<DeclarationId, DeclarationMetadata> = new Map();

  /**
   * Transitional map from DeclarationId to the op that originally declared
   * or materialized it. Still used by some export/import lowering paths,
   * but not required for local binding codegen.
   */
  declToDeclOp: Map<DeclarationId, OperationId> = new Map();

  /**
   * Maps each `PlaceId` to the op that defines that place.
   */
  placeToOp: Map<PlaceId, Operation> = new Map();

  /**
   * Set of `DeclarationId`s for mutable variables that are captured and/or
   * mutated across closure boundaries ("context variables"). These are
   * excluded from SSA renaming and use dedicated Load/StoreContext ops.
   */
  contextDeclarationIds: Set<DeclarationId> = new Set();

  /**
   * Per-module counter for function IDs. Unlike other counters, FuncOpId
   * stays per-module because the codegen assumes the entry function is always
   * ID 0 within each module (see {@link CodeGenerator.entryFunction}).
   */
  nextFunctionId = 0;

  constructor(private readonly projectEnvironment: ProjectEnvironment) {}

  /** Proxy getters/setters — delegates to ProjectEnvironment for global uniqueness. */
  get nextDeclarationId() {
    return this.projectEnvironment.nextDeclarationId;
  }
  set nextDeclarationId(v: number) {
    this.projectEnvironment.nextDeclarationId = v;
  }
  get nextIdentifierId() {
    return this.projectEnvironment.nextIdentifierId;
  }
  set nextIdentifierId(v: number) {
    this.projectEnvironment.nextIdentifierId = v;
  }
  get nextOperationId() {
    return this.projectEnvironment.nextOperationId;
  }
  set nextOperationId(v: number) {
    this.projectEnvironment.nextOperationId = v;
  }
  get nextPlaceId() {
    return this.projectEnvironment.nextPlaceId;
  }
  set nextPlaceId(v: number) {
    this.projectEnvironment.nextPlaceId = v;
  }

  public createIdentifier(declarationId?: DeclarationId): Identifier {
    declarationId ??= makeDeclarationId(this.projectEnvironment.nextDeclarationId++);

    const identifierId = makeIdentifierId(this.projectEnvironment.nextIdentifierId++);
    const version = this.declToPlaces.get(declarationId)?.length ?? 0;
    const identifier = new Identifier(identifierId, `${version}`, declarationId);
    this.identifiers.set(identifierId, identifier);
    return identifier;
  }

  public createPlace(identifier: Identifier): Place {
    const placeId = makePlaceId(this.projectEnvironment.nextPlaceId++);
    const place = new Place(placeId, identifier);
    this.places.set(placeId, place);
    return place;
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  public createOperation<C extends new (...args: any[]) => any>(
    Class: C,
    ...args: OmitFirst<ConstructorParameters<C>>
  ): InstanceType<C> {
    const opId = makeOperationId(this.projectEnvironment.nextOperationId++);
    const op = new Class(opId, ...args);
    this.operations.set(opId, op);
    if (op.place !== undefined) {
      this.placeToOp.set(op.place.id, op);
    }
    return op;
  }

  public createBlock(): BasicBlock {
    const blockId = makeBlockId(this.projectEnvironment.nextBlockId++);
    const block = new BasicBlock(blockId, [], undefined);
    this.blocks.set(blockId, block);
    return block;
  }

  public registerDeclaration(declarationId: DeclarationId, blockId: BlockId, placeId: PlaceId) {
    const placeIds = this.declToPlaces.get(declarationId) ?? [];
    placeIds.push({ blockId, placeId });
    this.declToPlaces.set(declarationId, placeIds);
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
    if (metadata.bindingPlaceId !== undefined) {
      existing.bindingPlaceId = metadata.bindingPlaceId;
    }
  }

  public getDeclarationMetadata(declarationId: DeclarationId): DeclarationMetadata | undefined {
    return this.declarationMetadata.get(declarationId);
  }

  public setDeclarationBindingPlace(declarationId: DeclarationId, placeId: PlaceId) {
    const metadata = this.declarationMetadata.get(declarationId);
    if (metadata === undefined) {
      throw new Error(`Declaration metadata not found for ${declarationId}`);
    }
    metadata.bindingPlaceId = placeId;
  }

  public ensureSyntheticDeclarationMetadata(
    declarationId: DeclarationId,
    kind: Extract<DeclarationKind, "let" | "const" | "var" | "class">,
    bindingPlace: Place,
  ) {
    if (!this.declarationMetadata.has(declarationId)) {
      this.registerDeclarationMetadata(declarationId, {
        kind,
        sourceName: bindingPlace.identifier.name,
        bindingPlaceId: bindingPlace.id,
      });
      return;
    }

    const metadata = this.declarationMetadata.get(declarationId)!;
    if (metadata.bindingPlaceId === undefined) {
      metadata.bindingPlaceId = bindingPlace.id;
    }
  }

  public getLatestDeclaration(declarationId: DeclarationId) {
    const placeIds = this.declToPlaces.get(declarationId) ?? [];
    return placeIds[placeIds.length - 1];
  }

  public getDeclarationBinding(declarationId: DeclarationId): Place | undefined {
    const bindingPlaceId = this.declarationMetadata.get(declarationId)?.bindingPlaceId;
    if (bindingPlaceId !== undefined) {
      return this.places.get(bindingPlaceId);
    }

    const places = this.declToPlaces.get(declarationId) ?? [];
    const first = places[0];
    return first ? this.places.get(first.placeId) : undefined;
  }

  public registerDeclarationOp(declarations: Place | Place[], op: Operation) {
    const declarations_ = castArray(declarations);
    declarations_.forEach((declaration) => {
      this.declToDeclOp.set(declaration.identifier.declarationId, op.id);
    });
  }

  public getDeclarationOp(declarationId: DeclarationId): OperationId | undefined {
    return this.declToDeclOp.get(declarationId);
  }
}
