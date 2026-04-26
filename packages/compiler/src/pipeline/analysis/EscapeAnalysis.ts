import {
  ArrayExpressionOp,
  BindingInitOp,
  type BlockId,
  CallExpressionOp,
  FunctionDeclarationOp,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ObjectPropertyOp,
  ReturnTermOp,
  StoreContextOp,
  StoreLocalOp,
  ThrowTermOp,
  type Value,
  type ValueId,
} from "../../ir";
import { outgoingEdges } from "../../ir/cfg";
import { FuncOp } from "../../ir/core/FuncOp";
import { successorArgValues } from "../../ir/core/TermOp";
import { AwaitExpressionOp } from "../../ir/ops/call/AwaitExpression";
import { TaggedTemplateExpressionOp } from "../../ir/ops/call/TaggedTemplateExpression";
import { YieldExpressionOp } from "../../ir/ops/call/YieldExpression";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { TemplateLiteralOp } from "../../ir/ops/prim/TemplateLiteral";
import { StoreDynamicPropertyOp } from "../../ir/ops/prop/StoreDynamicProperty";
import { StoreStaticPropertyOp } from "../../ir/ops/prop/StoreStaticProperty";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Escape classification for a value.
 *
 * - `NoEscape`: the value is only used locally.
 * - `ArgEscape`: the value is passed to opaque code, so it may be read
 *   or mutated by that call.
 * - `GlobalEscape`: the value can outlive this function or become
 *   globally reachable.
 */
export enum EscapeState {
  NoEscape = 0,
  ArgEscape = 1,
  GlobalEscape = 2,
}

export class EscapeAnalysisResult {
  constructor(private readonly escapeStates: ReadonlyMap<ValueId, EscapeState>) {}

  getEscapeState(id: ValueId): EscapeState {
    return this.escapeStates.get(id) ?? EscapeState.GlobalEscape;
  }

  doesNotEscape(id: ValueId): boolean {
    return this.getEscapeState(id) === EscapeState.NoEscape;
  }
}

/**
 * Computes conservative value escape states for a single function.
 *
 * The analysis tracks two relationships:
 *
 * 1. **Identity aliases** (`const y = x`, block params, local loads):
 *    escape propagates in both directions because both values can name
 *    the same runtime value.
 * 2. **Containment** (`{ x }`, `[x]`, property stores): escape propagates
 *    from the container to the contained value. If an object escapes,
 *    anything stored inside it escapes through that object.
 */
export class EscapeAnalysis extends FunctionAnalysis<EscapeAnalysisResult> {
  run(funcOp: FuncOp, _AM: AnalysisManager): EscapeAnalysisResult {
    const graph = new EscapeGraph();

    for (const param of funcOp.params) {
      graph.raise(param.value, EscapeState.GlobalEscape);
    }

    for (const block of funcOp.blocks) {
      for (const param of block.params) {
        graph.ensure(param);
      }
      for (const op of block.operations) {
        graph.visitOperation(op);
      }
      if (block.terminal !== undefined) {
        if (block.terminal instanceof ReturnTermOp && block.terminal.value !== null) {
          graph.raise(block.terminal.value, EscapeState.GlobalEscape);
        } else if (block.terminal instanceof ThrowTermOp) {
          for (const value of block.terminal.operands()) {
            graph.raise(value, EscapeState.GlobalEscape);
          }
        }
      }
    }

    const blocksById = new Map(funcOp.blocks.map((block) => [block.id, block]));
    for (const [blockId, incomingArgs] of buildIncomingEdgeArgsIndex(funcOp)) {
      const block = blocksById.get(blockId);
      if (block === undefined) continue;
      for (const args of incomingArgs) {
        for (let i = 0; i < block.params.length; i++) {
          const arg = args[i];
          if (arg !== undefined) {
            graph.addAlias(arg, block.params[i]);
          }
        }
      }
    }

    return new EscapeAnalysisResult(graph.solve());
  }
}

class EscapeGraph {
  private readonly states = new Map<ValueId, EscapeState>();
  private readonly aliases = new Map<ValueId, Set<ValueId>>();
  private readonly containedValues = new Map<ValueId, Set<ValueId>>();

  ensure(value: Value): void {
    if (!this.states.has(value.id)) {
      this.states.set(value.id, EscapeState.NoEscape);
    }
  }

  raise(value: Value, state: EscapeState): void {
    this.ensure(value);
    this.raiseId(value.id, state);
  }

  addAlias(left: Value, right: Value): void {
    this.ensure(left);
    this.ensure(right);
    this.addEdge(this.aliases, left.id, right.id);
    this.addEdge(this.aliases, right.id, left.id);
  }

  addContainedValue(container: Value, value: Value): void {
    this.ensure(container);
    this.ensure(value);
    this.addEdge(this.containedValues, container.id, value.id);
  }

  visitOperation(op: { results(): Value[]; operands(): Value[] }): void {
    for (const result of op.results()) {
      this.ensure(result);
    }

    if (op instanceof BindingInitOp) {
      this.addAlias(op.value, op.place);
      return;
    }

    if (op instanceof StoreLocalOp) {
      this.addAlias(op.value, op.lval);
      this.addAlias(op.value, op.place);
      for (const binding of op.bindings) {
        this.addAlias(op.value, binding);
      }
      return;
    }

    if (op instanceof LoadLocalOp || op instanceof LoadContextOp) {
      this.addAlias(op.value, op.place);
      return;
    }

    if (op instanceof LoadStaticPropertyOp || op instanceof LoadDynamicPropertyOp) {
      return;
    }

    if (op instanceof StoreStaticPropertyOp || op instanceof StoreDynamicPropertyOp) {
      this.addContainedValue(op.object, op.value);
      return;
    }

    if (op instanceof StoreContextOp) {
      this.raise(op.value, EscapeState.GlobalEscape);
      return;
    }

    if (op instanceof CallExpressionOp) {
      for (const arg of op.args) {
        this.raise(arg, EscapeState.ArgEscape);
      }
      return;
    }

    if (op instanceof NewExpressionOp) {
      for (const arg of op.args) {
        this.raise(arg, EscapeState.ArgEscape);
      }
      return;
    }

    if (
      op instanceof FunctionDeclarationOp ||
      op instanceof ArrowFunctionExpressionOp ||
      op instanceof FunctionExpressionOp
    ) {
      for (const capture of op.captures) {
        this.raise(capture, EscapeState.GlobalEscape);
      }
      return;
    }

    if (op instanceof YieldExpressionOp || op instanceof AwaitExpressionOp) {
      for (const value of op.operands()) {
        this.raise(value, EscapeState.GlobalEscape);
      }
      return;
    }

    if (op instanceof ObjectPropertyOp) {
      this.addContainedValue(op.place, op.value);
      return;
    }

    if (op instanceof ObjectExpressionOp) {
      for (const property of op.properties) {
        this.addContainedValue(op.place, property);
      }
      return;
    }

    if (op instanceof ArrayExpressionOp) {
      for (const element of op.elements) {
        this.addContainedValue(op.place, element);
      }
      return;
    }

    if (op instanceof TaggedTemplateExpressionOp) {
      this.raise(op.quasi, EscapeState.ArgEscape);
      return;
    }

    if (op instanceof TemplateLiteralOp) {
      for (const expr of op.expressions) {
        this.addContainedValue(op.place, expr);
      }
    }
  }

  solve(): ReadonlyMap<ValueId, EscapeState> {
    let changed = true;
    while (changed) {
      changed = false;

      for (const [source, targets] of this.aliases) {
        const sourceState = this.states.get(source) ?? EscapeState.NoEscape;
        for (const target of targets) {
          changed = this.raiseId(target, sourceState) || changed;
        }
      }

      for (const [container, values] of this.containedValues) {
        const containerState = this.states.get(container) ?? EscapeState.NoEscape;
        if (containerState === EscapeState.NoEscape) continue;
        for (const value of values) {
          changed = this.raiseId(value, containerState) || changed;
        }
      }
    }

    return this.states;
  }

  private raiseId(id: ValueId, state: EscapeState): boolean {
    const current = this.states.get(id) ?? EscapeState.NoEscape;
    if (state <= current) return false;
    this.states.set(id, state);
    return true;
  }

  private addEdge(map: Map<ValueId, Set<ValueId>>, from: ValueId, to: ValueId): void {
    let targets = map.get(from);
    if (targets === undefined) {
      targets = new Set();
      map.set(from, targets);
    }
    targets.add(to);
  }
}

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
      list.push(successorArgValues(edge.args));
    }
  }
  return index;
}
