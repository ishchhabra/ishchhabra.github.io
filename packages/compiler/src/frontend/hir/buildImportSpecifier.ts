import type * as ESTree from "estree";
import { Environment } from "../../environment";
import { DeclareLocalInstruction, ImportSpecifierInstruction } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { resolveModulePath } from "./resolveModulePath";

export function buildImportSpecifier(
  specifierNode: ESTree.ImportSpecifier | ESTree.ImportDefaultSpecifier | ESTree.ImportNamespaceSpecifier,
  declarationNode: ESTree.ImportDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const localName = getLocalName(specifierNode);
  const importedName = getImportedName(specifierNode);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ImportSpecifierInstruction,
    place,
    localName,
    importedName,
  );
  functionBuilder.addInstruction(instruction);

  // Register the import as a declaration so that export specifiers (and any
  // other consumer that looks up declarations by name) can find it through
  // the uniform getDeclarationId path.
  const bindingIdentifier = environment.createIdentifier();
  bindingIdentifier.name = localName;
  const bindingPlace = environment.createPlace(bindingIdentifier);
  const bindingInstruction = environment.createInstruction(
    DeclareLocalInstruction,
    bindingPlace,
    "const",
  );
  functionBuilder.addInstruction(bindingInstruction);

  functionBuilder.registerDeclarationName(
    localName,
    bindingIdentifier.declarationId,
    scope,
  );
  functionBuilder.instantiateDeclaration(bindingIdentifier.declarationId, "import", localName);
  environment.registerDeclaration(
    bindingIdentifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  environment.registerDeclarationInstruction(bindingPlace, instruction);

  const source = declarationNode.source.value;
  moduleBuilder.globals.set(localName, {
    kind: "import",
    name: importedName,
    source: resolveModulePath(source as string, moduleBuilder.path),
  });

  return place;
}

function getLocalName(
  node: ESTree.ImportSpecifier | ESTree.ImportDefaultSpecifier | ESTree.ImportNamespaceSpecifier,
) {
  return node.local.name;
}

function getImportedName(
  node: ESTree.ImportSpecifier | ESTree.ImportDefaultSpecifier | ESTree.ImportNamespaceSpecifier,
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
    return (importedNode as ESTree.Literal).value as string;
  }
}
