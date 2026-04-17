import {
  DeclareLocalOp,
  LiteralOp,
  LoadContextOp,
  LoadLocalOp,
  makeOperationId,
  Operation,
  StoreContextOp,
  StoreLocalOp,
} from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { collectAllSinks, Edge, EdgeSink, forEachIncomingEdge, sinkParams } from "./blockArgs";

/**
 * Out-of-SSA lowering.
 *
 * Two independent steps:
 *
 * 1. **Phi destruction** (Sreedhar Method I). Uniform over every
 *    SSA merge sink — regular block params *and* structured-op
 *    `resultPlaces` — via {@link collectAllSinks} +
 *    {@link forEachIncomingEdge}. For each sink param declare a
 *    backing `let` at function entry, then at each predecessor edge
 *    emit a `param = arg` copy store right before that predecessor's
 *    terminator. Placing stores before the terminator works without
 *    splitting critical edges because along any path the *last*
 *    store wins.
 *
 *    Works identically for flat-CFG `JumpOp` edges, `WhileOp` iter-
 *    arg ports (op-entry / condition-true / yield-back /
 *    condition-false), and `IfOp` arm yields. No op-specific
 *    handling — the edge walker abstracts the structured-op port
 *    wiring away.
 *
 * 2. **Intra-block interference preservation**. When an SSA value
 *    loaded from a source variable X is used after a later
 *    `StoreLocal(assignment)` to X within the same block, the naive
 *    LoadLocal-aliases-to-source codegen would emit the post-mutation
 *    value at the use site. We detect this interference and insert a
 *    `const $snap = X;` binding at the LoadLocal's site, rewriting
 *    the LoadLocal to read from the snapshot.
 */
export class SSAEliminator {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): void {
    this.#eliminatePhis();
    this.#preserveInterferingLoads();
  }

  // ---------------------------------------------------------------------
  // Phi destruction (uniform over block params + op-results sinks)
  // ---------------------------------------------------------------------

  #eliminatePhis(): void {
    // Walk every SSA merge sink in a stable order. SSABuilder
    // allocates identifier ids monotonically in phi-creation order,
    // so sorting each sink's params by their own ids keeps emission
    // order deterministic regardless of block iteration.
    //
    // Every merge param needs a backing `let` declaration and per-
    // edge copy stores. That includes both SSABuilder-synthesized
    // params (with `originalDeclarationId`, e.g. IDF-placed block
    // params and IfOp/WhileOp iter-arg lifts) AND frontend-created
    // result places with no source-level binding (e.g. IfOp result
    // for a `cond ? a : b` ternary or a `x ??= y` logical
    // assignment). Codegen's ternary fast-path will bypass the
    // emitted copy stores when both arms qualify; non-ternary paths
    // rely on the declaration to back downstream references to the
    // result place.
    type SinkSite = { sink: EdgeSink; param: Place; index: number };
    const sites: SinkSite[] = [];
    for (const sink of collectAllSinks(this.funcOp)) {
      const params = sinkParams(sink);
      for (let i = 0; i < params.length; i++) {
        sites.push({ sink, param: params[i], index: i });
      }
    }
    sites.sort((a, b) => a.param.identifier.id - b.param.identifier.id);

    for (const { sink, param, index } of sites) {
      this.#insertParamDeclaration(sink, param);

      forEachIncomingEdge(this.funcOp, sink, (edge: Edge) => {
        const arg = edge.args[index] ?? param;
        // Defensive self-store filter: some passes produce trivial
        // `arg = param` edges where args forward unchanged (the two
        // condition edges of a WhileOp share args with their own
        // beforeRegion params when the loop body doesn't mutate).
        if (arg.identifier.id === param.identifier.id) return;
        this.#insertCopyStore(edge, param, arg);
      });
    }
  }

  /**
   * Declare the backing `let $param;` for an SSA merge sink at the
   * dominator of all uses.
   *
   *   - For a block-params sink, that's the **function entry block**
   *     — the classical Cytron/Sreedhar convention. Block params can
   *     be referenced from arbitrarily many blocks post-merge, and
   *     the function entry dominates every block. Appended via
   *     `appendOp` (before the terminator) so they sit at the end
   *     of the prologue.
   *
   *   - For an op-results sink, that's the **parent block of the
   *     owning op**, inserted immediately before the op. The op's
   *     results are only visible to ops that follow the op in its
   *     parent block; declaring inline keeps the backing `let` at
   *     the natural source position (the same place generators used
   *     to emit it before SSA uniformity moved the job to
   *     SSAEliminator) and avoids ordering conflicts with any
   *     user-source declarations at the top of the entry block.
   */
  #insertParamDeclaration(sink: EdgeSink, param: Place): void {
    // Declaration metadata is keyed by the param's own declarationId.
    // Frontend-created result places (e.g. ??= / ternary) have no
    // `originalDeclarationId` — they're SSA-internal merge points —
    // but they still need a backing `let` so downstream references
    // resolve at runtime.
    this.moduleIR.environment.ensureSyntheticDeclarationMetadata(
      param.identifier.declarationId,
      "let",
      param,
    );

    const env = this.moduleIR.environment;

    const undefinedId = makeOperationId(env.nextOperationId++);
    const undefinedPlace = env.createPlace(env.createIdentifier());
    const undefinedInstr = new LiteralOp(undefinedId, undefinedPlace, undefined);

    const storeId = makeOperationId(env.nextOperationId++);
    const storePlace = env.createPlace(env.createIdentifier(param.identifier.declarationId));
    const storeInstr = new StoreLocalOp(
      storeId,
      storePlace,
      param,
      undefinedPlace,
      "let",
      "declaration",
    );

    const insertion = this.#resolveDeclarationInsertion(sink);
    if (insertion.kind === "append") {
      insertion.block.appendOp(undefinedInstr);
      insertion.block.appendOp(storeInstr);
    } else {
      insertion.block.insertOpAt(insertion.index, undefinedInstr);
      insertion.block.insertOpAt(insertion.index + 1, storeInstr);
    }

    env.placeToOp.set(undefinedPlace.id, undefinedInstr);
    env.placeToOp.set(storePlace.id, storeInstr);
  }

  /**
   * Resolve where the backing `let $param;` declaration for `sink`
   * should physically live so that it precedes every use in source
   * order AND sits at the source variable's natural scope point:
   *
   *   - **Op-results sink** (IfOp/WhileOp `resultPlaces`): the
   *     declaration goes in the enclosing structured op's *parent*
   *     block, immediately before the op itself. The op's results
   *     are visible only after the op; inlining the `let` at this
   *     position gives the natural "declare just above the
   *     statement that produces it" pattern.
   *
   *   - **Block sink for a structured-op region entry** (iter-arg
   *     block params on WhileOp's before/body-region entries):
   *     same as op-results — declaration goes in the structured
   *     op's parent block before the op. Iter-arg block params
   *     receive values on the op-entry edge and via the body's
   *     yield back-edge; both reach the param through the
   *     enclosing op, and the param has to be declared *before*
   *     the op's uses (e.g. a `while (...)` test that reads it).
   *
   *   - **Block sink for a flat-CFG merge block** (IDF-placed
   *     block params at dominance frontiers): declaration at the
   *     function entry block, appended before the terminator.
   *     Those merges live in a multi-block CFG whose dominator is
   *     the function entry; appending before the terminator keeps
   *     declarations in a single prologue-style band.
   */
  #resolveDeclarationInsertion(
    sink: EdgeSink,
  ):
    | { kind: "append"; block: BasicBlock }
    | { kind: "insertAt"; block: BasicBlock; index: number } {
    if (sink.kind === "op-results") {
      const op = sink.op;
      const parentBlock = op.parentBlock;
      if (parentBlock === null) {
        throw new Error("Op-results sink has no parent block — op is detached");
      }
      const opIndex = parentBlock.operations.indexOf(op);
      if (opIndex < 0) {
        throw new Error("Op-results sink's op not found in its parent block");
      }
      return { kind: "insertAt", block: parentBlock, index: opIndex };
    }

    // Block sink. If the block is a structured-op region entry,
    // declare inline before the structured op; otherwise, append at
    // the function entry block.
    const enclosing = this.#enclosingStructuredOpOfRegionEntry(sink.block);
    if (enclosing !== undefined) {
      const parentBlock = enclosing.parentBlock;
      if (parentBlock === null) {
        throw new Error("Structured op has no parent block — op is detached");
      }
      const opIndex = parentBlock.operations.indexOf(enclosing);
      if (opIndex < 0) {
        throw new Error("Structured op not found in its parent block");
      }
      return { kind: "insertAt", block: parentBlock, index: opIndex };
    }
    return { kind: "append", block: this.funcOp.getBlock(this.funcOp.entryBlockId) };
  }

  /**
   * If `block` is the entry block of some structured op's region,
   * return that op; otherwise undefined.
   */
  #enclosingStructuredOpOfRegionEntry(block: BasicBlock): Operation | undefined {
    const region = block.parent;
    if (region === null) return undefined;
    if (region.blocks[0] !== block) return undefined;
    const op = region.parent;
    if (op === null) return undefined;
    if (op.parentBlock === null) return undefined; // top-level FuncOp body
    return op;
  }

  #insertCopyStore(edge: Edge, param: Place, arg: Place): void {
    const storeId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const storePlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(param.identifier.declarationId),
    );
    const storeInstr = new StoreLocalOp(storeId, storePlace, param, arg, "let", "assignment");
    edge.insertCopyStore(storeInstr);
    this.moduleIR.environment.placeToOp.set(storePlace.id, storeInstr);
  }

  // ---------------------------------------------------------------------
  // Intra-block interference preservation
  // ---------------------------------------------------------------------

  /**
   * For every `LoadLocalOp` / `LoadContextOp` in every block, check
   * whether any `StoreLocal(assignment)` / `StoreContext(assignment)`
   * to the load's source declaration lies between the load and its
   * last in-block use. If so, materialize a `const $snap = source;`
   * binding at the load site and rewire the load to read from `$snap`.
   *
   * This preserves the pre-mutation value in a distinct runtime
   * binding, which codegen's zero-cost LoadLocal aliasing can then
   * safely use. Local and context loads are treated symmetrically:
   * the mutation-detection side already accepts both StoreLocalOp
   * and StoreContextOp, so the load-detection side must too.
   */
  #preserveInterferingLoads(): void {
    for (const block of this.funcOp.allBlocks()) {
      this.#preserveInterferingLoadsInBlock(block);
    }
  }

  #preserveInterferingLoadsInBlock(block: BasicBlock): void {
    // Walk by index; we may insert a declaration right before the current
    // load, so advance past the inserts.
    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (!(op instanceof LoadLocalOp) && !(op instanceof LoadContextOp)) continue;
      if (!this.#interferes(block, op, i)) continue;

      const inserted = this.#materializeLoadSnapshot(block, op, i);
      i += inserted;
    }
  }

  /**
   * True iff a store to `load`'s source declaration lies between
   * `load`'s position and the last position (within this block) that
   * reads `load`'s result. Cross-block uses are treated as interfering —
   * the value must outlive the block, so we can't prove no mutation
   * reaches the consumer.
   */
  #interferes(block: BasicBlock, load: LoadLocalOp | LoadContextOp, defIdx: number): boolean {
    const resultId = load.place.identifier;
    if (resultId.uses.size === 0) return false;

    const srcDecl = load.value.identifier.declarationId;
    const ops = block.operations;

    let lastUseIdx = -1;
    for (const user of resultId.uses) {
      if (!(user instanceof Operation)) continue;
      if (user.parentBlock !== block) return true;
      const userIdx = ops.indexOf(user);
      if (userIdx > lastUseIdx) lastUseIdx = userIdx;
    }
    const terminal = block.terminal;
    if (terminal !== undefined) {
      for (const p of terminal.getOperands()) {
        if (p.identifier === resultId) {
          lastUseIdx = ops.length;
          break;
        }
      }
    }
    if (lastUseIdx <= defIdx) return false;

    for (let j = defIdx + 1; j < lastUseIdx; j++) {
      const mid = ops[j];
      if (
        (mid instanceof StoreLocalOp || mid instanceof StoreContextOp) &&
        mid.kind === "assignment" &&
        mid.lval.identifier.declarationId === srcDecl
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Insert
   *     DeclareLocal const $snap
   *     StoreLocal(declaration) $snap = <source>
   * immediately before `load`, and replace `load` with a fresh LoadLocal
   * that reads from `$snap` and keeps the same result place. Returns the
   * number of ops inserted before `load`'s new position so the caller
   * can adjust its walking index.
   */
  #materializeLoadSnapshot(
    block: BasicBlock,
    load: LoadLocalOp | LoadContextOp,
    defIdx: number,
  ): number {
    const env = this.moduleIR.environment;

    const snapIdentifier = env.createIdentifier();
    const snapPlace = env.createPlace(snapIdentifier);

    const declareOp = new DeclareLocalOp(
      makeOperationId(env.nextOperationId++),
      snapPlace,
      "const",
    );

    const storeResultPlace = env.createPlace(env.createIdentifier());
    const storeOp = new StoreLocalOp(
      makeOperationId(env.nextOperationId++),
      storeResultPlace,
      snapPlace,
      load.value,
      "const",
      "declaration",
    );

    block.insertOpAt(defIdx, declareOp);
    block.insertOpAt(defIdx + 1, storeOp);
    env.placeToOp.set(storeResultPlace.id, storeOp);

    const newLoad = new LoadLocalOp(makeOperationId(env.nextOperationId++), load.place, snapPlace);
    block.replaceOp(load, newLoad);
    env.placeToOp.set(load.place.id, newLoad);

    return 2;
  }
}
