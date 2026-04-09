import { castArray } from "lodash-es";
import {
  BaseInstruction,
  BasicBlock,
  BlockId,
  InstructionId,
  makeBlockId,
  makeInstructionId,
} from "./ir";
import {
  DeclarationId,
  Identifier,
  IdentifierId,
  makeDeclarationId,
  makeIdentifierId,
} from "./ir/core/Identifier";
import { makePlaceId, Place, PlaceId } from "./ir/core/Place";
import {
  LexicalScope,
  makeLexicalScopeId,
  type LexicalScopeId,
  type LexicalScopeKind,
} from "./ir/core/LexicalScope";
import { ProjectEnvironment } from "./ProjectEnvironment";

// oxlint-disable-next-line typescript/no-explicit-any
type OmitFirst<T extends unknown[]> = T extends [any, ...infer Rest] ? Rest : never;

export class Environment {
  public readonly identifiers: Map<IdentifierId, Identifier> = new Map();
  public readonly places: Map<PlaceId, Place> = new Map();
  public readonly instructions: Map<InstructionId, BaseInstruction> = new Map();
  public readonly blocks: Map<BlockId, BasicBlock> = new Map();
  public readonly scopes: Map<LexicalScopeId, LexicalScope> = new Map();

  private nextScopeId = 0;

  public createScope(parent: LexicalScopeId | null, kind: LexicalScopeKind): LexicalScope {
    const id = makeLexicalScopeId(this.nextScopeId++);
    const scope = new LexicalScope(id, parent, kind);
    this.scopes.set(id, scope);
    return scope;
  }

  /**
   * Maps each `DeclarationId` (representing a declared variable or function name)
   * to an array of objects, where each object includes:
   * - `blockId`: the ID of the basic block in which this version of the declaration
   *   was assigned or updated
   * - `place`: the `Place` holding the (SSA) value for that version
   *
   * In an SSA-based IR, each new assignment to a declaration in a different block
   * or scope effectively creates a new “version” of that declaration, captured by
   * a distinct `Place`. This structure keeps track of those versions over time.
   */
  declToPlaces: Map<DeclarationId, Array<{ blockId: BlockId; placeId: PlaceId }>> = new Map();

  /**
   * Maps each `DeclarationId` to the `InstructionId` of the IR instruction responsible
   * for its *declaration statement*. When multiple variables are declared
   * together (e.g. `const a = 1, b = 2`), all associated `DeclarationId`s will
   * map to the *same* StoreLocal instruction.
   */
  declToDeclInstr: Map<DeclarationId, InstructionId> = new Map();

  /**
   * Maps each `PlaceId` to the IR instruction that is associated with it.
   */
  placeToInstruction: Map<PlaceId, BaseInstruction> = new Map();

  /**
   * Set of `DeclarationId`s for mutable variables that are captured and/or
   * mutated across closure boundaries ("context variables"). These are
   * excluded from SSA renaming and use dedicated Load/StoreContext instructions.
   */
  contextDeclarationIds: Set<DeclarationId> = new Set();

  /**
   * Per-module counter for function IDs. Unlike other counters, FunctionIRId
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
  get nextInstructionId() {
    return this.projectEnvironment.nextInstructionId;
  }
  set nextInstructionId(v: number) {
    this.projectEnvironment.nextInstructionId = v;
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
  public createInstruction<C extends new (...args: any[]) => any>(
    Class: C,
    ...args: OmitFirst<ConstructorParameters<C>>
  ): InstanceType<C> {
    const instructionId = makeInstructionId(this.projectEnvironment.nextInstructionId++);
    const instruction = new Class(instructionId, ...args);
    this.instructions.set(instructionId, instruction);
    this.placeToInstruction.set(instruction.place.id, instruction);
    return instruction;
  }

  public createBlock(scopeId: LexicalScopeId): BasicBlock {
    const blockId = makeBlockId(this.projectEnvironment.nextBlockId++);
    const block = new BasicBlock(blockId, scopeId, [], undefined);
    this.blocks.set(blockId, block);
    return block;
  }

  public registerDeclaration(declarationId: DeclarationId, blockId: BlockId, placeId: PlaceId) {
    const placeIds = this.declToPlaces.get(declarationId) ?? [];
    placeIds.push({ blockId, placeId });
    this.declToPlaces.set(declarationId, placeIds);
  }

  public getLatestDeclaration(declarationId: DeclarationId) {
    const placeIds = this.declToPlaces.get(declarationId) ?? [];
    return placeIds[placeIds.length - 1];
  }

  public registerDeclarationInstruction(
    declarations: Place | Place[],
    instruction: BaseInstruction,
  ) {
    const declarations_ = castArray(declarations);
    declarations_.forEach((declaration) => {
      this.declToDeclInstr.set(declaration.identifier.declarationId, instruction.id);
    });
  }

  public getDeclarationInstruction(declarationId: DeclarationId): InstructionId | undefined {
    return this.declToDeclInstr.get(declarationId);
  }
}
