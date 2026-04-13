import type {
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
} from "oxc-parser";
import { Environment } from "../../environment";
import { ImportSpecifierOp } from "../../ir";
import type * as AST from "../estree";
import { type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { resolveModulePath } from "./resolveModulePath";

export function buildImportSpecifier(
  specifierNode: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier,
  declarationNode: ImportDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const localName = getLocalName(specifierNode);
  const importedName = getImportedName(specifierNode);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    ImportSpecifierOp,
    place,
    localName,
    importedName,
  );
  functionBuilder.addOp(instruction);

  // Register the import binding so later loads/codegen can treat it as a
  // source declaration without depending on a separate DeclareLocal node.
  const bindingIdentifier = environment.createIdentifier();
  bindingIdentifier.name = localName;
  const bindingPlace = environment.createPlace(bindingIdentifier);

  functionBuilder.registerDeclarationName(localName, bindingIdentifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(
    bindingIdentifier.declarationId,
    "import",
    localName,
    scope,
  );
  environment.registerDeclaration(
    bindingIdentifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  environment.setDeclarationBindingPlace(bindingIdentifier.declarationId, bindingPlace.id);
  environment.registerDeclarationOp(bindingPlace, instruction);

  const source = declarationNode.source.value;
  moduleBuilder.moduleIR.globals.set(localName, {
    kind: "import",
    name: importedName,
    source: resolveModulePath(source as string, moduleBuilder.moduleIR.path),
  });

  return place;
}

function getLocalName(node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier) {
  return node.local.name;
}

function getImportedName(
  node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier,
) {
  if (node.type === "ImportDefaultSpecifier") {
    return "default";
  } else if (node.type === "ImportNamespaceSpecifier") {
    return "*";
  } else {
    const importedNode = node.imported;
    if (importedNode.type === "Identifier") {
      return importedNode.name;
    }

    // ESTree Literal with string value
    return (importedNode as AST.Literal).value as string;
  }
}
