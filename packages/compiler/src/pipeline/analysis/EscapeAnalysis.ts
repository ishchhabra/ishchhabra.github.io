import {
  type BlockId,
  CallExpressionOp,
  FunctionDeclarationOp,
  ValueId,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ArrayExpressionOp,
  type Value,
  StoreContextOp,
  StoreLocalOp,
  ReturnTermOp,
  ThrowTermOp,
} from "../../ir";
import { outgoingEdges } from "../../ir/cfg";
import { StoreStaticPropertyOp } from "../../ir/ops/prop/StoreStaticProperty";
import { StoreDynamicPropertyOp } from "../../ir/ops/prop/StoreDynamicProperty";
import { FuncOp } from "../../ir/core/FuncOp";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { YieldExpressionOp } from "../../ir/ops/call/YieldExpression";
import { AwaitExpressionOp } from "../../ir/ops/call/AwaitExpression";
import { TaggedTemplateExpressionOp } from "../../ir/ops/call/TaggedTemplateExpression";
import { TemplateLiteralOp } from "../../ir/ops/prim/TemplateLiteral";
import { FunctionAnalysis, AnalysisManager } from "./AnalysisManager";

/**
 * Escape classification for an identifier.
 *
 * - **NoEscape**: The value never leaves the local scope — it is not
 *   passed to an unknown call, stored into a heap location, returned,
 *   or captured by a closure. Safe for scalar replacement.
 *
 * - **ArgEscape**: The value is passed as an argument to a call but
 *   is not stored globally or returned. The callee may read it but
 *   (conservatively) we do not know what the callee does.
 *
 * - **GlobalEscape**: The value escapes to the heap, is returned from
 *   the function, thrown, yielded, stored into a context variable,
 *   or stored into another object's property.
 */
export enum EscapeState {
  NoEscape = 0,
  ArgEscape = 1,
  GlobalEscape = 2,
}

export class EscapeAnalysisResult {
  constructor(private readonly escapeStates: ReadonlyMap<ValueId, EscapeState>) {}

  /** Returns the escape state for an identifier (defaults to GlobalEscape if unknown). */
  getEscapeState(id: ValueId): EscapeState {
    return this.escapeStates.get(id) ?? EscapeState.GlobalEscape;
  }

  /** Returns true if the identifier does not escape at all. */
  doesNotEscape(id: ValueId): boolean {
    return this.getEscapeState(id) === EscapeState.NoEscape;
  }
}

/**
 * Computes escape information for all identifiers in a function.
 *
 * The analysis walks every instruction and terminal, classifying each
 * identifier by how it is used:
 *
 * - Definitions (ObjectExpression, ArrayExpression, etc.) start as NoEscape.
 * - Uses that only read (LoadStaticProperty, LoadLocal) do not cause escape.
 * - Passing to a call → ArgEscape.
 * - Returning, throwing, yielding, storing into a property of another
 *   object, storing to a context variable, or being captured by a
 *   closure → GlobalEscape.
 *
 * Escape states are propagated through copies and stores: if `x = y`
 * and `x` escapes, then `y` also escapes. Propagation runs to fixpoint.
 */
export class EscapeAnalysis extends FunctionAnalysis<EscapeAnalysisResult> {
  run(funcOp: FuncOp, _AM: AnalysisManager): EscapeAnalysisResult {
    const states = new Map<ValueId, EscapeState>();

    const raise = (id: ValueId, state: EscapeState) => {
      const current = states.get(id) ?? EscapeState.NoEscape;
      if (state > current) {
        states.set(id, state);
      }
    };

    // Track aliases: source → targets. If a target escapes, source must too.
    const aliases = new Map<ValueId, Set<ValueId>>();

    const addAlias = (source: ValueId, target: ValueId) => {
      let set = aliases.get(source);
      if (!set) {
        set = new Set();
        aliases.set(source, set);
      }
      set.add(target);
    };

    // Phase 1: Walk all instructions and classify uses.
    for (const block of funcOp.blocks) {
      for (const instr of block.operations) {
        // Ensure every defined identifier has an entry.
        for (const place of instr.results()) {
          if (!states.has(place.id)) {
            states.set(place.id, EscapeState.NoEscape);
          }
        }

        if (instr instanceof StoreLocalOp) {
          addAlias(instr.value.id, instr.lval.id);
          continue;
        }

        if (instr instanceof LoadLocalOp) {
          addAlias(instr.value.id, instr.place.id);
          continue;
        }

        if (instr instanceof LoadContextOp) {
          addAlias(instr.value.id, instr.place.id);
          continue;
        }

        if (instr instanceof LoadStaticPropertyOp || instr instanceof LoadDynamicPropertyOp) {
          // Property reads don't cause the object to escape.
          continue;
        }

        if (instr instanceof StoreStaticPropertyOp || instr instanceof StoreDynamicPropertyOp) {
          // Storing a value into a property → value escapes to heap.
          raise(instr.value.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof StoreContextOp) {
          raise(instr.value.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof CallExpressionOp) {
          for (const arg of instr.args) {
            raise(arg.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (instr instanceof NewExpressionOp) {
          for (const arg of instr.args) {
            raise(arg.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (
          instr instanceof FunctionDeclarationOp ||
          instr instanceof ArrowFunctionExpressionOp ||
          instr instanceof FunctionExpressionOp
        ) {
          for (const capture of instr.captures) {
            raise(capture.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof YieldExpressionOp) {
          for (const place of instr.operands()) {
            raise(place.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof AwaitExpressionOp) {
          for (const place of instr.operands()) {
            raise(place.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof ObjectExpressionOp) {
          // Object creation reads its properties but doesn't cause escape.
          continue;
        }

        if (instr instanceof ArrayExpressionOp) {
          // Array elements flow into the aggregate.
          for (const element of instr.elements) {
            addAlias(element.id, instr.place.id);
          }
          continue;
        }

        if (instr instanceof TaggedTemplateExpressionOp) {
          // tag`...${expr}...` calls the tag with the quasi as argument.
          raise(instr.quasi.id, EscapeState.ArgEscape);
          continue;
        }

        if (instr instanceof TemplateLiteralOp) {
          // Expressions flow into the template result. If the result
          // escapes (e.g., via a tagged template), the expressions escape.
          for (const expr of instr.expressions) {
            addAlias(expr.id, instr.place.id);
          }
          continue;
        }

        // BinaryExpression, UnaryExpression, Literal, etc. — read places
        // are consumed to produce a new value, no escape.
      }

      // Classify terminal uses.
      if (block.terminal) {
        if (block.terminal instanceof ReturnTermOp && block.terminal.value) {
          raise(block.terminal.value.id, EscapeState.GlobalEscape);
        }
        if (block.terminal instanceof ThrowTermOp) {
          for (const place of block.terminal.operands()) {
            raise(place.id, EscapeState.GlobalEscape);
          }
        }
      }
    }

    // Phase 2: Propagate escape states through aliases to fixpoint.
    const incomingEdgeArgs = buildIncomingEdgeArgsIndex(funcOp);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [source, targets] of aliases) {
        for (const target of targets) {
          const targetState = states.get(target) ?? EscapeState.NoEscape;
          const sourceState = states.get(source) ?? EscapeState.NoEscape;
          if (targetState > sourceState) {
            states.set(source, targetState);
            changed = true;
          }
        }
      }

      // Block-args propagation: if a block param escapes, every
      // incoming edge arg at that position escapes too (the param
      // may forward any of them out of the function).
      for (const block of funcOp.blocks) {
        if (block.params.length === 0) continue;
        const incoming = incomingEdgeArgs.get(block.id);
        if (incoming === undefined) continue;
        for (let i = 0; i < block.params.length; i++) {
          const paramState = states.get(block.params[i].id) ?? EscapeState.NoEscape;
          if (paramState === EscapeState.NoEscape) continue;
          for (const args of incoming) {
            const arg = args[i];
            if (arg === undefined) continue;
            const argState = states.get(arg.id) ?? EscapeState.NoEscape;
            if (paramState > argState) {
              states.set(arg.id, paramState);
              changed = true;
            }
          }
        }
      }
    }

    return new EscapeAnalysisResult(states);
  }
}

/**
 * Index the args lists flowing into each block from every
 * outgoing edge of every predecessor. A single predecessor may
 * contribute more than one arg list to the same successor (e.g.
 * a switch with several cases pointing at the same block).
 */
function buildIncomingEdgeArgsIndex(funcOp: FuncOp): Map<BlockId, readonly (readonly Value[])[]> {
  const index = new Map<BlockId, (readonly Value[])[]>();
  for (const predBlock of funcOp.blocks) {
    for (const edge of outgoingEdges(funcOp, predBlock)) {
      const succId = edge.sink.id;
      let list = index.get(succId);
      if (list === undefined) {
        list = [];
        index.set(succId, list);
      }
      list.push(edge.args);
    }
  }
  return index;
}
