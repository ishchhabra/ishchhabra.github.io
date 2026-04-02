import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import { DeclareLocalInstruction, ImportSpecifierInstruction } from "../../ir";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { resolveModulePath } from "./resolveModulePath";

export function buildImportSpecifier(
  specifierNodePath: NodePath<
    t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier
  >,
  declarationNodePath: NodePath<t.ImportDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const localName = getLocalName(specifierNodePath);
  const importedName = getImportedName(specifierNodePath);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ImportSpecifierInstruction,
    place,
    specifierNodePath,
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
    specifierNodePath,
    "const",
  );
  functionBuilder.addInstruction(bindingInstruction);

  functionBuilder.registerDeclarationName(
    localName,
    bindingIdentifier.declarationId,
    declarationNodePath,
  );
  functionBuilder.instantiateDeclaration(bindingIdentifier.declarationId, "import", localName);
  environment.registerDeclaration(
    bindingIdentifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  environment.registerDeclarationInstruction(bindingPlace, instruction);

  const source = declarationNodePath.node.source.value;
  moduleBuilder.globals.set(localName, {
    kind: "import",
    name: importedName,
    source: resolveModulePath(source, moduleBuilder.path),
  });

  return place;
}

function getLocalName(
  nodePath: NodePath<t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier>,
) {
  return nodePath.node.local.name;
}

function getImportedName(
  nodePath: NodePath<t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier>,
) {
  const node = nodePath.node;
  if (t.isImportDefaultSpecifier(node)) {
    return "default";
  } else if (t.isImportNamespaceSpecifier(node)) {
    return "*";
  } else {
    const importedNode = node.imported;
    if (t.isIdentifier(importedNode)) {
      return importedNode.name;
    }

    return importedNode.value;
  }
}
