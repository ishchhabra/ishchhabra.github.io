import {
  BranchTermOp,
  BindingDeclOp,
  BindingInitOp,
  IfTermOp,
  JumpTermOp,
  LoadContextOp,
  LoadLocalOp,
  makeOperationId,
  Operation,
  StoreContextOp,
  StoreLocalOp,
} from "../../ir";
import { incomingEdges, mergeSinks } from "../../ir/cfg";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { successorArgValue, valueBlockTarget } from "../../ir/core/TermOp";
import { Value } from "../../ir/core/Value";
import { DominatorTree } from "../analysis/DominatorTreeAnalysis";
import type { PassResult } from "../PassManager";
import { EdgeCopyScheduler } from "./EdgeCopyScheduler";

/**
 * Out-of-SSA lowering.
 *
 * Two independent steps:
 *
 * 1. **Phi destruction** (Sreedhar Method I). Uniform over every
 *    SSA merge block via {@link mergeSinks} + {@link incomingEdges}.
 *    For each sink param declare a backing `let` at function entry,
 *    then at each predecessor edge emit a `param = arg` copy store.
 *
 *    Structured loop iter args are still canonical CFG block params.
 *    The loop-carried helper classifies incoming loop edges as
 *    initial args vs yield args, so the JS `for` lowering boundary
 *    can place copies without making every optimizer learn a second
 *    SSA form.
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
  #domTree: DominatorTree | undefined;
  #edgeCopyScheduler: EdgeCopyScheduler | undefined;

  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public run(): PassResult {
    this.#domTree = DominatorTree.compute(this.funcOp);
    this.#edgeCopyScheduler = new EdgeCopyScheduler(this.funcOp, this.moduleIR, this.#domTree);
    try {
      this.#eliminatePhis();
      this.#edgeCopyScheduler.emit();
      this.#clearLoweredBlockArguments();
      this.#preserveInterferingLoads();
    } finally {
      this.#domTree = undefined;
      this.#edgeCopyScheduler = undefined;
    }
    return { changed: true };
  }

  public eliminate(): void {
    this.run();
  }

  // ---------------------------------------------------------------------
  // Phi destruction (uniform over block params)
  // ---------------------------------------------------------------------

  #eliminatePhis(): void {
    // Walk every SSA merge sink in a stable order. SSABuilder
    // allocates identifier ids monotonically in phi-creation order,
    // so sorting each sink's params by their own ids keeps emission
    // order deterministic regardless of block iteration.
    //
    // Every merge param needs a backing `let` declaration and per-
    // edge copy stores.
    type SinkSite = { sink: BasicBlock; param: Value; index: number };
    const sites: SinkSite[] = [];
    for (const sink of mergeSinks(this.funcOp)) {
      for (let i = 0; i < sink.params.length; i++) {
        sites.push({ sink, param: sink.params[i], index: i });
      }
    }
    sites.sort((a, b) => a.param.id - b.param.id);

    for (const { sink, param, index } of sites) {
      // Skip dead merges: if nothing reads the phi result, neither
      // the backing `let` nor the per-edge copies serve a purpose.
      // Emitting them would force DCE-removed arg Values back into
      // the IR as phantom operands.
      if (param.users.size === 0) continue;

      this.#insertParamDeclaration(sink, param);

      for (const edge of incomingEdges(this.funcOp, sink)) {
        const edgeArg = edge.args[index];
        const arg = edgeArg === undefined ? param : successorArgValue(edgeArg);
        // Defensive self-store filter: some passes produce trivial
        // `arg = param` edges where args forward unchanged (the two
        // condition edges of a WhileOp share args with their own
        // beforeRegion params when the loop body doesn't mutate).
        if (arg.id === param.id) continue;
        this.#edgeCopyScheduler?.add(edge, param, arg);
      }
    }
  }

  /**
   * Declare the backing `let $param;` for an SSA merge sink at the
   * dominator of all uses.
   *
   * That's the **function entry block** — the classical Cytron/
   * Sreedhar convention. Block params can be referenced from
   * arbitrarily many blocks post-merge, and the function entry
   * dominates every block. Appending before the terminator keeps
   * declarations in a single prologue-style band.
   */
  #insertParamDeclaration(sink: BasicBlock, param: Value): void {
    // Declaration metadata is keyed by the param's own declarationId.
    this.moduleIR.environment.ensureSyntheticDeclarationMetadata(param.declarationId, "let", param);

    const env = this.moduleIR.environment;

    const declId = makeOperationId(env.nextOperationId++);
    const declInstr = new BindingDeclOp(declId, param, "let");

    const insertion = this.#resolveDeclarationInsertion(sink);
    if (insertion.kind === "append") {
      insertion.block.appendOp(declInstr);
    } else {
      insertion.block.insertOpAt(insertion.index, declInstr);
    }
  }

  #resolveDeclarationInsertion(
    _sink: BasicBlock,
  ):
    | { kind: "append"; block: BasicBlock }
    | { kind: "insertAt"; block: BasicBlock; index: number } {
    // All sinks are blocks in the flat CFG. Declarations land at the
    // function entry block — any merge point is dominated by it.
    return { kind: "append", block: this.funcOp.entryBlock };
  }

  #clearLoweredBlockArguments(): void {
    for (const block of this.funcOp.blocks) {
      const terminal = block.terminal;
      if (terminal instanceof JumpTermOp && terminal.args.length > 0) {
        block.replaceTerminal(new JumpTermOp(terminal.id, valueBlockTarget(terminal.targetBlock)));
      } else if (
        terminal instanceof BranchTermOp &&
        (terminal.trueArgs.length > 0 || terminal.falseArgs.length > 0)
      ) {
        block.replaceTerminal(
          new BranchTermOp(
            terminal.id,
            terminal.cond,
            valueBlockTarget(terminal.trueTarget),
            valueBlockTarget(terminal.falseTarget),
          ),
        );
      } else if (
        terminal instanceof IfTermOp &&
        (terminal.thenTarget.args.length > 0 || terminal.elseTarget.args.length > 0)
      ) {
        block.replaceTerminal(
          new IfTermOp(
            terminal.id,
            terminal.cond,
            { block: terminal.thenBlock, args: [] },
            { block: terminal.elseBlock, args: [] },
            terminal.fallthroughBlock,
          ),
        );
      }

      if (block.params.length > 0) {
        block.params = [];
      }
    }
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
    for (const block of this.funcOp.blocks) {
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
    const resultId = load.place;
    if (resultId.users.size === 0) return false;

    const srcDecl = load.value.declarationId;
    const ops = block.operations;

    let lastUseIdx = -1;
    for (const user of resultId.users) {
      if (!(user instanceof Operation)) continue;
      if (user.parentBlock !== block) return true;
      const userIdx = ops.indexOf(user);
      if (userIdx > lastUseIdx) lastUseIdx = userIdx;
    }
    const terminal = block.terminal;
    if (terminal !== undefined) {
      for (const p of terminal.operands()) {
        if (p === resultId) {
          lastUseIdx = ops.length;
          break;
        }
      }
    }
    if (lastUseIdx <= defIdx) return false;

    for (let j = defIdx + 1; j < lastUseIdx; j++) {
      const mid = ops[j];
      if (
        (mid instanceof StoreLocalOp ||
          (mid instanceof StoreContextOp && mid.kind === "assignment")) &&
        mid.lval.declarationId === srcDecl
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Insert
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

    const snapPlace = env.createValue();

    const initOp = new BindingInitOp(
      makeOperationId(env.nextOperationId++),
      snapPlace,
      "const",
      load.value,
    );

    block.insertOpAt(defIdx, initOp);

    const newLoad = new LoadLocalOp(makeOperationId(env.nextOperationId++), load.place, snapPlace);
    block.replaceOp(load, newLoad);

    return 1;
  }
}
