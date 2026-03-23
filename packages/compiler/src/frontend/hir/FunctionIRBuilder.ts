import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import {
  BaseInstruction,
  BaseStructure,
  BasicBlock,
  BlockId,
  type ControlContext,
  createInstructionId,
  DeclarationId,
  Place,
  ReturnTerminal,
} from "../../ir";
import { FunctionIR, makeFunctionIRId } from "../../ir/core/FunctionIR";
import { buildBindings } from "./bindings";
import { buildFunctionParams } from "./buildFunctionParams";
import { buildNode } from "./buildNode";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export class FunctionIRBuilder {
  public currentBlock: BasicBlock;
  public readonly blocks: Map<BlockId, BasicBlock> = new Map();
  public readonly structures: Map<BlockId, BaseStructure> = new Map();
  public readonly header: BaseInstruction[] = [];
  public readonly controlStack: ControlContext[] = [];

  /**
   * Places captured from enclosing scopes, keyed by DeclarationId to
   * avoid duplicates when the same variable is referenced multiple times.
   * Stored on the function instruction so that `getReadPlaces()` exposes
   * them to optimization passes, preventing DCE from eliminating captured
   * variable definitions in the outer scope.
   */
  public readonly captures = new Map<DeclarationId, Place>();

  /**
   * Local places inside this function that correspond to each captured
   * variable. Aligned by key with `captures`: for each DeclarationId,
   * `captureParams.get(declId)` is the local Place that instructions in
   * this function's blocks use to reference the captured variable.
   *
   * This indirection decouples the function's blocks from the parent
   * scope's identifiers, so rewriting captures (e.g. during SSA or
   * inlining) never requires modifying the function's blocks.
   */
  public readonly captureParams = new Map<DeclarationId, Place>();

  constructor(
    public readonly paramPaths: NodePath<t.Identifier | t.RestElement | t.Pattern>[],
    public readonly bodyPath: NodePath<t.Program | t.BlockStatement | t.Expression>,
    public readonly environment: Environment,
    public readonly moduleBuilder: ModuleIRBuilder,
    public readonly async: boolean,
    public readonly generator: boolean,
  ) {
    const entryBlock = this.environment.createBlock();
    this.blocks.set(entryBlock.id, entryBlock);
    this.currentBlock = entryBlock;
  }

  public build(): FunctionIR {
    const builtParams = buildFunctionParams(
      this.paramPaths,
      this.bodyPath,
      this,
      this.moduleBuilder,
      this.environment,
    );
    const params = builtParams.map((p) => p.place);
    const paramBindings = builtParams.map((p) => p.paramBindings);

    const functionId = makeFunctionIRId(this.environment.nextFunctionId++);

    if (this.bodyPath.isExpression()) {
      const resultPlace = buildNode(this.bodyPath, this, this.moduleBuilder, this.environment);
      if (resultPlace !== undefined && !Array.isArray(resultPlace)) {
        // Add an explicit ReturnTerminal so the codegen knows what value
        // the expression body produces, even when the IR has multiple
        // blocks (e.g. from ternary or logical expressions).
        this.currentBlock.terminal = new ReturnTerminal(
          createInstructionId(this.environment),
          resultPlace,
        );
      }
    } else {
      buildBindings(this.bodyPath, this, this.environment);
      const bodyPath = this.bodyPath.get("body");
      if (!Array.isArray(bodyPath)) {
        throw new Error("Body path is not an array");
      }

      for (const statementPath of bodyPath) {
        buildNode(statementPath, this, this.moduleBuilder, this.environment);
        if (this.currentBlock.terminal !== undefined) {
          break;
        }
      }
    }

    const functionIR = new FunctionIR(
      functionId,
      this.header,
      params,
      paramBindings,
      this.async,
      this.generator,
      this.blocks,
      this.structures,
      [...this.captureParams.values()],
    );
    this.moduleBuilder.functions.set(functionIR.id, functionIR);
    return functionIR;
  }

  public addInstruction<T extends BaseInstruction>(instruction: T) {
    this.currentBlock.instructions.push(instruction);
    this.environment.placeToInstruction.set(instruction.place.id, instruction);
  }

  public registerDeclarationName(
    name: string,
    declarationId: DeclarationId,
    nodePath: NodePath<t.Node>,
  ) {
    nodePath.scope.setData(name, declarationId);
  }

  public getDeclarationId(name: string, nodePath: NodePath<t.Node>): DeclarationId | undefined {
    return nodePath.scope.getData(name);
  }

  /**
   * Returns true if the given declaration was created in one of this
   * function's blocks (i.e. it is an own declaration, not a capture from
   * an enclosing scope).
   *
   * Works by checking which block the declaration was first registered in
   * (via `declToPlaces[0].blockId`) against this function's block set.
   */
  public isOwnDeclaration(declarationId: DeclarationId): boolean {
    const entries = this.environment.declToPlaces.get(declarationId);
    if (!entries || entries.length === 0) return false;
    return this.blocks.has(entries[0].blockId);
  }

  /**
   * Copies captures from a child function builder into this builder,
   * filtering out declarations owned by this function. This propagates
   * transitive captures: if a grandchild function captures a variable
   * from the grandparent scope, all intermediate functions must also
   * list it as a capture so DCE keeps the definition alive at each level.
   *
   * Both `captures` and `captureParams` are populated so the two maps
   * stay aligned by DeclarationId — consumers iterate them in lockstep
   * by index to bind each inner capture parameter to the corresponding
   * outer place.
   */
  public propagateCapturesFrom(child: FunctionIRBuilder): void {
    for (const [declId, capture] of child.captures) {
      if (!this.isOwnDeclaration(declId)) {
        this.captures.set(declId, capture);
        if (!this.captureParams.has(declId)) {
          const paramIdentifier = this.environment.createIdentifier(declId);
          paramIdentifier.name = capture.identifier.name;
          this.captureParams.set(declId, this.environment.createPlace(paramIdentifier));
        }
      }
    }
  }

  public getBreakTarget(): BlockId | undefined {
    return this.controlStack[this.controlStack.length - 1]?.breakTarget;
  }

  public getContinueTarget(): BlockId | undefined {
    for (let i = this.controlStack.length - 1; i >= 0; i--) {
      const ctx = this.controlStack[i];
      if (ctx.kind === "loop") {
        return ctx.continueTarget;
      }
    }

    return undefined;
  }
}
