import type {
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
} from "oxc-parser";
import { Environment } from "../../environment";
import { importNameToExportName, ImportSpecifierOp, type ImportName } from "../../ir";
import type * as AST from "../estree";
import { type Scope } from "../scope/Scope";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { resolveModulePath } from "./resolveModulePath";

export function buildImportSpecifier(
  specifierNode: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier,
  declarationNode: ImportDeclaration,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const localName = getLocalName(specifierNode);
  const importedName = getImportedName(specifierNode);
  const source = declarationNode.source.value;
  const resolvedSource = resolveModulePath(source as string, moduleBuilder.moduleIR.path);

  const bindingPlace = environment.createValue();
  bindingPlace.name = localName;

  functionBuilder.registerDeclarationName(localName, bindingPlace.declarationId, scope);
  functionBuilder.instantiateDeclaration(bindingPlace.declarationId, "import", localName, scope);
  environment.registerDeclarationMetadata(bindingPlace.declarationId, {
    kind: "import",
    sourceName: localName,
    scopeId: scope.id,
    storage: "module",
    bindingValue: bindingPlace,
    import: {
      source: resolvedSource,
      imported: importedName,
    },
  });
  environment.registerDeclaration(
    bindingPlace.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace,
  );
  environment.setDeclarationBinding(bindingPlace.declarationId, bindingPlace);

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ImportSpecifierOp,
    place,
    bindingPlace.declarationId,
    localName,
    importedName,
  );
  functionBuilder.addOp(instruction);

  moduleBuilder.moduleIR.globals.set(localName, {
    kind: "import",
    name: importNameToExportName(importedName),
    source: resolvedSource,
  });

  return place;
}

function getLocalName(node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier) {
  return node.local.name;
}

function getImportedName(
  node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier,
): ImportName {
  if (node.type === "ImportDefaultSpecifier") {
    return { kind: "default" };
  } else if (node.type === "ImportNamespaceSpecifier") {
    return { kind: "namespace" };
  } else {
    const importedNode = node.imported;
    if (importedNode.type === "Identifier") {
      return { kind: "named", name: importedNode.name };
    }

    // ESTree Literal with string value
    return { kind: "named", name: (importedNode as AST.Literal).value as string };
  }
}
