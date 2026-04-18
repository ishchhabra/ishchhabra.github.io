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

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ImportSpecifierOp,
    place,
    localName,
    importedName,
  );
  functionBuilder.addOp(instruction);

  // The import binding is a distinct Value from the op's own `place`
  // slot because codegen stores different Babel nodes in each:
  // `place` holds the `t.ImportSpecifier` AST node, `bindingPlace`
  // holds the source-visible `t.identifier(localName)` that reads
  // (and re-exports) reference. We link `bindingPlace.definer` to the
  // op so downstream export resolution (`localPlace.definer`) can walk
  // from any read of the binding back to the ImportSpecifierOp that
  // materialized it.
  const bindingPlace = environment.createValue();
  bindingPlace.name = localName;
  bindingPlace._setDefiner(instruction);

  functionBuilder.registerDeclarationName(localName, bindingPlace.declarationId, scope);
  functionBuilder.instantiateDeclaration(bindingPlace.declarationId, "import", localName, scope);
  environment.registerDeclaration(
    bindingPlace.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  environment.setDeclarationBinding(bindingPlace.declarationId, bindingPlace.id);

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
