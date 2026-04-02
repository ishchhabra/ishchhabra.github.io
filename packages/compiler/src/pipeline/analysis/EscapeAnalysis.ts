import {
  CallExpressionInstruction,
  CopyInstruction,
  IdentifierId,
  LoadContextInstruction,
  LoadDynamicPropertyInstruction,
  LoadLocalInstruction,
  LoadPhiInstruction,
  LoadStaticPropertyInstruction,
  NewExpressionInstruction,
  ObjectExpressionInstruction,
  ArrayExpressionInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  ReturnTerminal,
  ThrowTerminal,
} from "../../ir";
import { StoreStaticPropertyInstruction } from "../../ir/instructions/memory/StoreStaticProperty";
import { StoreDynamicPropertyInstruction } from "../../ir/instructions/memory/StoreDynamicProperty";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { YieldExpressionInstruction } from "../../ir/instructions/value/YieldExpression";
import { AwaitExpressionInstruction } from "../../ir/instructions/value/AwaitExpression";
import { TaggedTemplateExpressionInstruction } from "../../ir/instructions/value/TaggedTemplateExpression";
import { TemplateLiteralInstruction } from "../../ir/instructions/value/TemplateLiteral";
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
    for (const block of functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        // Ensure every defined identifier has an entry.
        for (const place of instr.getWrittenPlaces()) {
          if (!states.has(place.identifier.id)) {
            states.set(place.identifier.id, EscapeState.NoEscape);
          }
        }

        if (instr instanceof StoreLocalInstruction) {
          addAlias(instr.value.identifier.id, instr.lval.identifier.id);
          continue;
        }

        if (instr instanceof LoadLocalInstruction) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof LoadPhiInstruction) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof LoadContextInstruction) {
          addAlias(instr.value.identifier.id, instr.place.identifier.id);
          continue;
        }

        if (instr instanceof CopyInstruction) {
          addAlias(instr.value.identifier.id, instr.lval.identifier.id);
          continue;
        }

        if (
          instr instanceof LoadStaticPropertyInstruction ||
          instr instanceof LoadDynamicPropertyInstruction
        ) {
          // Property reads don't cause the object to escape.
          continue;
        }

        if (
          instr instanceof StoreStaticPropertyInstruction ||
          instr instanceof StoreDynamicPropertyInstruction
        ) {
          // Storing a value into a property → value escapes to heap.
          raise(instr.value.identifier.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof StoreContextInstruction) {
          raise(instr.value.identifier.id, EscapeState.GlobalEscape);
          continue;
        }

        if (instr instanceof CallExpressionInstruction) {
          for (const arg of instr.args) {
            raise(arg.identifier.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (instr instanceof NewExpressionInstruction) {
          for (const arg of instr.args) {
            raise(arg.identifier.id, EscapeState.ArgEscape);
          }
          continue;
        }

        if (
          instr instanceof ArrowFunctionExpressionInstruction ||
          instr instanceof FunctionExpressionInstruction
        ) {
          for (const capture of instr.captures) {
            raise(capture.identifier.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof YieldExpressionInstruction) {
          for (const place of instr.getReadPlaces()) {
            raise(place.identifier.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof AwaitExpressionInstruction) {
          for (const place of instr.getReadPlaces()) {
            raise(place.identifier.id, EscapeState.GlobalEscape);
          }
          continue;
        }

        if (instr instanceof ObjectExpressionInstruction) {
          // Object creation reads its properties but doesn't cause escape.
          continue;
        }

        if (instr instanceof ArrayExpressionInstruction) {
          // Array elements flow into the aggregate.
          for (const element of instr.elements) {
            addAlias(element.identifier.id, instr.place.identifier.id);
          }
          continue;
        }

        if (instr instanceof TaggedTemplateExpressionInstruction) {
          // tag`...${expr}...` calls the tag with the quasi as argument.
          raise(instr.quasi.identifier.id, EscapeState.ArgEscape);
          continue;
        }

        if (instr instanceof TemplateLiteralInstruction) {
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
        if (block.terminal instanceof ReturnTerminal && block.terminal.value) {
          raise(block.terminal.value.identifier.id, EscapeState.GlobalEscape);
        }
        if (block.terminal instanceof ThrowTerminal) {
          for (const place of block.terminal.getReadPlaces()) {
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
