import type {
  BlockStatement,
  ArrowFunctionExpression,
  Function as OxcFunction,
  ForOfStatement,
  Program,
  ForInStatement,
  SwitchStatement,
  PrivateIdentifier,
} from "oxc-parser";

import { BasicBlock } from "../ir/core/Block";
import { FunctionIR, type FunctionParam } from "../ir/core/FunctionIR";
import type { ModuleExport } from "../ir/core/ModuleExport";
import { ModuleIR } from "../ir/core/ModuleIR";
import { Operation, OperationId } from "../ir/core/Operation";
import type { PrivateName } from "../ir/core/PrivateName";
import { TerminatorOp } from "../ir/core/TerminatorOp";
import { DeclarationId, Value } from "../ir/core/Value";
import { BindingIdentifierNode, ScopeOwnerNode, ScopeReferenceNode } from "./ast/types";
import { lowerDeclarationInstantiation } from "./declarations/lowerDeclarationInstantiation";
import { IRBuildContext } from "./ModuleIRBuilder";
import { Declaration } from "./scope/Declaration";
import { ScopeDeclarationInstantiation } from "./scope/DeclarationInstantiationPlan";
import { Scope } from "./scope/Scope";
import { lowerStatement } from "./statements/lowerStatement";

export interface CreateFunctionIROptions {
  readonly kind?: FunctionIR["kind"];
  readonly name?: string | null;
  readonly params?: readonly FunctionParam[];
  readonly captures?: readonly Declaration[];
  readonly isAsync?: boolean;
  readonly isGenerator?: boolean;
}

export interface CreatedFunctionIR {
  readonly functionIR: FunctionIR;
  readonly entryBlock: BasicBlock;
  readonly builder: FunctionIRBuilder;
}

export interface LoopControlContext {
  readonly kind: "loop";
  readonly label: string | null;
  readonly breakTarget: BasicBlock;
  readonly continueTarget: BasicBlock;
}

export interface LabelControlContext {
  readonly kind: "label";
  readonly label: string | null;
  readonly breakTarget: BasicBlock;
}

export type ControlContext = LoopControlContext | LabelControlContext;

/**
 * Lowers statements and expressions into one function body.
 *
 * The builder owns the insertion point for a function. It may create additional
 * blocks for control flow, but every block and operation it creates belongs to
 * the same `FunctionIR`.
 */
export class FunctionIRBuilder {
  #currentBlock: BasicBlock;
  readonly #controls: ControlContext[] = [];

  constructor(
    private readonly context: IRBuildContext,
    private readonly moduleIR: ModuleIR,
    private readonly functionIR: FunctionIR,
    entryBlock: BasicBlock,
  ) {
    if (entryBlock.ownerFunction !== functionIR) {
      throw new Error(`Block bb${entryBlock.id} does not belong to Function#${functionIR.id}`);
    }

    this.#currentBlock = entryBlock;
  }

  /**
   * Current block receiving newly lowered operations.
   */
  public get currentBlock(): BasicBlock {
    return this.#currentBlock;
  }

  /**
   * Current function boundary params.
   */
  public get params(): readonly FunctionParam[] {
    return this.functionIR.params;
  }

  /**
   * Lowers a program body into this function.
   */
  public lowerProgram(program: Program): void {
    lowerDeclarationInstantiation(this, program);

    for (const statement of program.body) {
      lowerStatement(this, statement);
    }
  }

  /**
   * Moves the insertion point to an existing block.
   */
  public setCurrentBlock(block: BasicBlock): void {
    if (block.ownerFunction !== this.functionIR) {
      throw new Error(`Block bb${block.id} does not belong to Function#${this.functionIR.id}`);
    }

    this.#currentBlock = block;
  }

  /**
   * Enters a break/continue target region while lowering nested statements.
   */
  public pushControl(context: ControlContext): void {
    this.#controls.push(context);
  }

  /**
   * Leaves the most recent break/continue target region.
   *
   * Throws if lowering exits regions out of order.
   */
  public popControl(expected: ControlContext): void {
    const actual = this.#controls.pop();
    if (actual !== expected) {
      throw new Error(`Expected ${expected.kind} control context, got ${actual?.kind}`);
    }
  }

  /**
   * Returns the block targeted by a `break` statement.
   *
   * A null label resolves to the nearest breakable loop or labeled statement.
   */
  public breakTarget(label: string | null): BasicBlock {
    for (let i = this.#controls.length - 1; i >= 0; i--) {
      const context = this.#controls[i];

      if (context.kind === "loop" && label === null) {
        return context.breakTarget;
      }

      if (context.label === label) {
        return context.breakTarget;
      }
    }

    throw new Error(label === null ? "Illegal break statement" : `Unknown break label: ${label}`);
  }

  /**
   * Returns the block targeted by a `continue` statement.
   *
   * A null label resolves to the nearest enclosing loop. A non-null label must
   * name an enclosing labeled loop.
   */
  public continueTarget(label: string | null): BasicBlock {
    for (let index = this.#controls.length - 1; index >= 0; index--) {
      const context = this.#controls[index];
      if (context.kind !== "loop") continue;

      if (label === null || context.label === label) {
        return context.continueTarget;
      }
    }

    throw new Error(
      label === null ? "Illegal continue statement" : `Unknown continue label: ${label}`,
    );
  }

  /**
   * Creates and appends a block to this function.
   */
  public createBlock(): BasicBlock {
    const block = new BasicBlock(this.context.ids.blockId());
    this.functionIR.addBlock(block);
    return block;
  }

  /**
   * Creates, registers, and returns a nested function plus its builder.
   */
  public createNestedFunctionIR(options: CreateFunctionIROptions = {}): CreatedFunctionIR {
    const entryBlock = new BasicBlock(this.context.ids.blockId());
    const functionIR = new FunctionIR(this.context.ids.functionId(), {
      params: [
        ...(options.params ?? []),
        ...(options.captures ?? []).map(
          (capture): FunctionParam => ({
            kind: "capture",
            declarationId: capture.id,
          }),
        ),
      ],
      blocks: [entryBlock],
      kind: options.kind,
      name: options.name,
      isAsync: options.isAsync,
      isGenerator: options.isGenerator,
      parentFunction: this.functionIR,
    });

    this.moduleIR.addFunction(functionIR);

    return {
      functionIR,
      entryBlock,
      builder: new FunctionIRBuilder(this.context, this.moduleIR, functionIR, entryBlock),
    };
  }

  /**
   * Allocates a stable operation id.
   */
  public operationId(): OperationId {
    return this.context.ids.operationId();
  }

  /** Creates a temporary SSA value. */
  public createValue(declarationId: DeclarationId | null = null): Value {
    return new Value(this.context.ids.valueId(), declarationId);
  }

  /**
   * Returns the declaration introduced by a binding identifier.
   */
  public declarationForBinding(binding: BindingIdentifierNode): Declaration {
    return this.context.scopes.declarationForBinding(binding);
  }

  /**
   * Returns the declaration resolved for an identifier reference.
   */
  public declarationForReference(reference: ScopeReferenceNode): Declaration {
    return this.context.scopes.declarationForReference(reference);
  }

  /**
   * Returns whether an identifier reference resolves through host/global lookup.
   */
  public isGlobalReference(reference: ScopeReferenceNode): boolean {
    return this.context.scopes.isGlobalReference(reference);
  }

  /**
   * Returns the private name resolved for a private identifier.
   */
  public privateNameFor(identifier: PrivateIdentifier): PrivateName {
    return this.context.scopes.privateNameFor(identifier);
  }

  /**
   * Returns the scope associated with a scope-owning AST node.
   */
  public scopeForOwner(
    owner:
      | Program
      | BlockStatement
      | OxcFunction
      | ArrowFunctionExpression
      | ForOfStatement
      | ForInStatement
      | SwitchStatement,
  ): Scope {
    return this.context.scopes.scopeForOwner(owner);
  }

  /**
   * Returns declarations captured by the function scope associated with an AST owner.
   */
  public capturesForOwner(owner: ScopeOwnerNode): readonly Declaration[] {
    return this.context.scopes.capturesForOwner(owner);
  }

  /**
   * Returns declaration-instantiation work for a scope.
   */
  public instantiationForScope(scope: Scope): ScopeDeclarationInstantiation {
    return this.context.instantiation.declarationsForScope(scope);
  }

  /**
   * Records a static export on the owning module.
   */
  public addModuleExport(record: ModuleExport): void {
    this.moduleIR.addExport(record);
  }

  /**
   * Replaces the current function's parameter list.
   */
  public setParams(params: readonly FunctionParam[]): void {
    this.functionIR.setParams(params);
  }

  /**
   * Appends an operation at the current insertion point.
   */
  public emit<Op extends Operation>(op: Op): Op {
    this.#currentBlock.appendOp(op);
    return op;
  }

  /**
   * Terminates the current block.
   */
  public terminate<Op extends TerminatorOp>(op: Op): Op {
    this.#currentBlock.setTerminator(op);
    return op;
  }
}
