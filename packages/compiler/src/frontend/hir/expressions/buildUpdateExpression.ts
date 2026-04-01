import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BindingIdentifierInstruction,
  LoadLocalInstruction,
  Place,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildBinaryExpression } from "./buildBinaryExpression";
import { buildMemberExpressionUpdate } from "./buildMemberExpression";

export function buildUpdateExpression(
  nodePath: NodePath<t.UpdateExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const argumentPath = nodePath.get("argument");
  if (argumentPath.isMemberExpression()) {
    return buildMemberExpressionUpdate(
      nodePath,
      argumentPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (!argumentPath.isIdentifier()) {
    throw new Error(`Unsupported argument type: ${argumentPath.type}`);
  }

  const declarationId = functionBuilder.getDeclarationId(argumentPath.node.name, nodePath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${argumentPath.node.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(
      functionBuilder.getDeclarationSourceName(declarationId) ?? argumentPath.node.name,
    );
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId)!;
  const originalPlace = environment.places.get(latestDeclaration.placeId);
  if (originalPlace === undefined) {
    throw new Error(`Unable to find the place for ${argumentPath.node.name} (${declarationId})`);
  }

  // For postfix operations, snapshot the original value into a temporary
  // so that codegen emits a distinct variable for the pre-increment value.
  // Without this, in loops with phi nodes the original place gets reassigned
  // before codegen can read the pre-increment value.
  let oldValLoadPlace = originalPlace;
  if (!nodePath.node.prefix) {
    const oldValBinding = environment.createIdentifier();
    const oldValBindingPlace = environment.createPlace(oldValBinding);
    functionBuilder.addInstruction(
      environment.createInstruction(BindingIdentifierInstruction, oldValBindingPlace, nodePath),
    );
    const oldValStorePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        oldValStorePlace,
        nodePath,
        oldValBindingPlace,
        originalPlace,
        "const",
      ),
    );
    oldValLoadPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        LoadLocalInstruction,
        oldValLoadPlace,
        nodePath,
        oldValBindingPlace,
      ),
    );
  }

  let lvalPlace: Place;
  if (environment.contextDeclarationIds.has(declarationId)) {
    lvalPlace = originalPlace;
  } else {
    const lvalIdentifier = environment.createIdentifier(declarationId);
    lvalPlace = environment.createPlace(lvalIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(BindingIdentifierInstruction, lvalPlace, nodePath),
    );
  }

  const rightLiteral = t.numericLiteral(1);
  const isIncrement = nodePath.node.operator === "++";
  const binaryExpression = t.binaryExpression(
    isIncrement ? "+" : "-",
    argumentPath.node,
    rightLiteral,
  );
  const binaryExpressionPath = createSyntheticBinaryPath(nodePath, binaryExpression);

  const valuePlace = buildBinaryExpression(
    binaryExpressionPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (valuePlace === undefined || Array.isArray(valuePlace)) {
    throw new Error("Update expression value must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const instruction = isContext
    ? environment.createInstruction(
        StoreContextInstruction,
        place,
        nodePath,
        lvalPlace,
        valuePlace,
        "let",
        "assignment",
      )
    : environment.createInstruction(
        StoreLocalInstruction,
        place,
        nodePath,
        lvalPlace,
        valuePlace,
        "const",
      );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, lvalPlace.id);

  if (nodePath.node.prefix) {
    // For prefix (++i), return a LoadLocal of the stored value so codegen
    // references the named variable ($0_1) instead of re-emitting the
    // binary expression.
    const loadIdentifier = environment.createIdentifier(declarationId);
    const loadPlace = environment.createPlace(loadIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(LoadLocalInstruction, loadPlace, nodePath, lvalPlace),
    );
    return loadPlace;
  }
  return oldValLoadPlace;
}

function createSyntheticBinaryPath(
  parentPath: NodePath<t.Node>,
  binExpr: t.BinaryExpression,
): NodePath<t.BinaryExpression> {
  const containerNode = t.expressionStatement(binExpr);

  const newPath = NodePath.get({
    hub: parentPath.hub,
    parentPath,
    parent: parentPath.node,
    container: containerNode,
    key: "expression",
  });

  return newPath as NodePath<t.BinaryExpression>;
}
