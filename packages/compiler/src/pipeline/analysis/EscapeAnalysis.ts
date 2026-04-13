import {
  CallExpressionOp,
  CopyOp,
  FunctionDeclarationOp,
  IdentifierId,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadPhiOp,
  LoadStaticPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ArrayExpressionOp,
  StoreContextOp,
  StoreLocalOp,
  ReturnOp,
  ThrowOp,
} from "../../ir";
import { StoreStaticPropertyOp } from "../../ir/ops/prop/StoreStaticProperty";
import { StoreDynamicPropertyOp } from "../../ir/ops/prop/StoreDynamicProperty";
import { FunctionIR } from "../../ir/core/FunctionIR";
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
  constructor(private readonly escapeStates: ReadonlyMap<IdentifierId, EscapeState>) {}

  /** Returns the escape state for an identifier (defaults to GlobalEscape if unknown). */
  getEscapeState(id: IdentifierId): EscapeState {
    return this.escapeStates.get(id) ?? EscapeState.GlobalEscape;
  }

  /** Returns true if the identifier does not escape at all. */
  doesNotEscape(id: IdentifierId): boolean {
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
  run(functionIR: FunctionIR, _AM: AnalysisManager): EscapeAnalysisResult {
    const states = new Map<IdentifierId, EscapeState>();

    const raise = (id: IdentifierId, state: EscapeState) => {
      const current = states.get(id) ?? EscapeState.NoEscape;
      if (state > current) {
        states.set(id, state);
      }
    };

    // Track aliases: source → targets. If a target escapes, source must too.
    const aliases = new Map<IdentifierId, Set<IdentifierId>>();

    const addAlias = (source: IdentifierId, target: IdentifierId) => {
      let set = aliases.get(source);
      if (!set) {
        set = new Set();
        aliases.set(source, set);
      }
      set.add(target);
    };

    // Phase 1: Walk all instructions and classify uses.
    for (const block of functionIR.allBlocks()) {
      for (const instr of block.operations) {
        // Ensure every defined identifier has an entry.
        for (const place of instr.getDefs()) {
          if (!states.has(place.identifier.id)) {
            states.set(place.identifier.id, EscapeState.NoEscape);
          }
        }

        if (instr instanceof StoreLocalOp) {
          addAlias(instr.value.identifier.id, instr.lval.identifier.id);
          continue;
        }

        if (instr instanceof LoadLocalOp) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof LoadPhiOp) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof LoadContextOp) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof CopyOp) {
          addAlias(instr.value.identifier.id, instr.lval.identifier.id);
          continue;
        }

        if (instr instanceof LoadStaticPropertyOp || instr instanceof LoadDynamicPropertyOp) {
          // Property reads don't cause the object to escape.
          continue;
        }

        if (instr instanceof StoreStaticPropertyOp || instr instanceof StoreDynamicPropertyOp) {
          // Storing a value into a property → value escapes to heap.
          raise(instr.value.identifier.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof StoreContextOp) {
          raise(instr.value.identifier.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof CallExpressionOp) {
          for (const arg of instr.args) {
            raise(arg.identifier.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (instr instanceof NewExpressionOp) {
          for (const arg of instr.args) {
            raise(arg.identifier.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (
          instr instanceof FunctionDeclarationOp ||
          instr instanceof ArrowFunctionExpressionOp ||
          instr instanceof FunctionExpressionOp
        ) {
          for (const capture of instr.captures) {
            raise(capture.identifier.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof YieldExpressionOp) {
          for (const place of instr.getOperands()) {
            raise(place.identifier.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof AwaitExpressionOp) {
          for (const place of instr.getOperands()) {
            raise(place.identifier.id, EscapeState.GlobalEscape);
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
            addAlias(element.identifier.id, instr.place.identifier.id);
          }
          continue;
        }

        if (instr instanceof TaggedTemplateExpressionOp) {
          // tag`...${expr}...` calls the tag with the quasi as argument.
          raise(instr.quasi.identifier.id, EscapeState.ArgEscape);
          continue;
        }

        if (instr instanceof TemplateLiteralOp) {
          // Expressions flow into the template result. If the result
          // escapes (e.g., via a tagged template), the expressions escape.
          for (const expr of instr.expressions) {
            addAlias(expr.identifier.id, instr.place.identifier.id);
          }
          continue;
        }

        // BinaryExpression, UnaryExpression, Literal, etc. — read places
        // are consumed to produce a new value, no escape.
      }

      // Classify terminal uses.
      if (block.terminal) {
        if (block.terminal instanceof ReturnOp && block.terminal.value) {
          raise(block.terminal.value.identifier.id, EscapeState.GlobalEscape);
        }
        if (block.terminal instanceof ThrowOp) {
          for (const place of block.terminal.getOperands()) {
            raise(place.identifier.id, EscapeState.GlobalEscape);
          }
        }
      }
    }

    // Phase 2: Propagate escape states through aliases to fixpoint.
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

      for (const phi of functionIR.phis) {
        const resultState = states.get(phi.place.identifier.id) ?? EscapeState.NoEscape;
        for (const [, operand] of phi.operands) {
          const operandState = states.get(operand.identifier.id) ?? EscapeState.NoEscape;
          if (resultState > operandState) {
            states.set(operand.identifier.id, resultState);
            changed = true;
          }
        }
      }
    }

    return new EscapeAnalysisResult(states);
  }
}
