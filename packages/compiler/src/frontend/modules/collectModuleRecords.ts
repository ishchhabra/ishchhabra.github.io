import type {
  BindingIdentifier,
  BindingPattern,
  BindingRestElement,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ImportAttribute,
  ImportDeclarationSpecifier,
  ImportDeclaration,
  ExportSpecifier,
  ModuleExportName,
  Program,
  VariableDeclaration,
} from "oxc-parser";
import type {
  ModuleAttribute,
  ModuleExportName as IRModuleExportName,
} from "../../ir/core/ModuleName";
import type { ModuleIR } from "../../ir/core/ModuleIR";
import type { ScopeGraph } from "../scope/ScopeGraph";

/**
 * Records static import/export module metadata after scope analysis.
 *
 * Runtime module body lowering remains separate: exported declarations are
 * lowered as normal declarations, while these records describe the module's
 * linkage surface for codegen and future linker passes.
 */
export function collectModuleRecords(
  moduleIR: ModuleIR,
  scopes: ScopeGraph,
  program: Program,
): void {
  for (const statement of program.body) {
    switch (statement.type) {
      case "ImportDeclaration":
        collectImportDeclaration(moduleIR, scopes, statement);
        break;

      case "ExportNamedDeclaration":
        collectExportNamedDeclaration(moduleIR, scopes, statement);
        break;

      case "ExportDefaultDeclaration":
        collectExportDefaultDeclaration(moduleIR, scopes, statement);
        break;

      case "ExportAllDeclaration":
        collectExportAllDeclaration(moduleIR, statement);
        break;
    }
  }
}

function collectImportDeclaration(
  moduleIR: ModuleIR,
  scopes: ScopeGraph,
  declaration: ImportDeclaration,
): void {
  if (declaration.importKind === "type") return;

  const attributes = moduleAttributes(declaration.attributes);
  const valueSpecifiers = declaration.specifiers.filter(isValueImportSpecifier);

  if (valueSpecifiers.length === 0) {
    if (declaration.specifiers.length > 0) return;

    moduleIR.addImport({
      kind: "bare",
      source: declaration.source.value,
      attributes,
    });
    return;
  }

  for (const specifier of valueSpecifiers) {
    const binding = scopes.declarationForBinding(specifier.local);

    switch (specifier.type) {
      case "ImportDefaultSpecifier":
        moduleIR.addImport({
          kind: "default",
          source: declaration.source.value,
          attributes,
          localName: specifier.local.name,
          declarationId: binding.id,
        });
        break;

      case "ImportNamespaceSpecifier":
        moduleIR.addImport({
          kind: "namespace",
          source: declaration.source.value,
          attributes,
          localName: specifier.local.name,
          declarationId: binding.id,
        });
        break;

      case "ImportSpecifier":
        moduleIR.addImport({
          kind: "named",
          source: declaration.source.value,
          attributes,
          importedName: moduleExportName(specifier.imported),
          localName: specifier.local.name,
          declarationId: binding.id,
        });
        break;
    }
  }
}

function collectExportNamedDeclaration(
  moduleIR: ModuleIR,
  scopes: ScopeGraph,
  declaration: ExportNamedDeclaration,
): void {
  if (declaration.exportKind === "type") return;

  if (declaration.declaration !== null) {
    collectExportedDeclaration(moduleIR, scopes, declaration.declaration);
    return;
  }

  const valueSpecifiers = declaration.specifiers.filter(isValueExportSpecifier);
  const attributes = moduleAttributes(declaration.attributes);

  for (const specifier of valueSpecifiers) {
    if (declaration.source !== null) {
      moduleIR.addExport({
        kind: "re-export",
        source: declaration.source.value,
        importedName: moduleExportName(specifier.local),
        exportedName: moduleExportName(specifier.exported),
        attributes,
      });
      continue;
    }

    const local = localExportName(specifier.local);
    const binding = scopes.declarationForReference(local);

    moduleIR.addExport({
      kind: "local",
      localName: local.name,
      exportedName: moduleExportName(specifier.exported),
      declarationId: binding.id,
    });
  }
}

function collectExportedDeclaration(
  moduleIR: ModuleIR,
  scopes: ScopeGraph,
  declaration: NonNullable<ExportNamedDeclaration["declaration"]>,
): void {
  switch (declaration.type) {
    case "VariableDeclaration":
      for (const binding of bindingIdentifiers(declaration)) {
        const sourceDeclaration = scopes.declarationForBinding(binding);
        moduleIR.addExport({
          kind: "local",
          localName: binding.name,
          exportedName: moduleIdentifierName(binding.name),
          declarationId: sourceDeclaration.id,
        });
      }
      return;

    case "FunctionDeclaration":
    case "ClassDeclaration": {
      if (declaration.id === null) {
        throw new Error("Exported declaration is missing a binding name");
      }

      const sourceDeclaration = scopes.declarationForBinding(declaration.id);
      moduleIR.addExport({
        kind: "local",
        localName: declaration.id.name,
        exportedName: moduleIdentifierName(declaration.id.name),
        declarationId: sourceDeclaration.id,
      });
      return;
    }

    default:
      throw new Error(`Unsupported exported declaration: ${declaration.type}`);
  }
}

function collectExportDefaultDeclaration(
  moduleIR: ModuleIR,
  scopes: ScopeGraph,
  declaration: ExportDefaultDeclaration,
): void {
  const exported = declaration.declaration;

  if (exported.type !== "FunctionDeclaration" && exported.type !== "ClassDeclaration") {
    return;
  }

  if (exported.id === null) {
    return;
  }

  moduleIR.addExport({
    kind: "default-local",
    declarationId: scopes.declarationForBinding(exported.id).id,
  });
}

function collectExportAllDeclaration(moduleIR: ModuleIR, declaration: ExportAllDeclaration): void {
  if (declaration.exportKind === "type") return;

  moduleIR.addExport({
    kind: "export-all",
    source: declaration.source.value,
    exportedName: declaration.exported === null ? null : moduleExportName(declaration.exported),
    attributes: moduleAttributes(declaration.attributes),
  });
}

function bindingIdentifiers(declaration: VariableDeclaration): BindingIdentifier[] {
  return declaration.declarations.flatMap((declarator) => bindingPatternIdentifiers(declarator.id));
}

function bindingPatternIdentifiers(
  pattern: BindingPattern | BindingRestElement,
): BindingIdentifier[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern];

    case "ArrayPattern":
      return pattern.elements.flatMap((element) =>
        element === null ? [] : bindingPatternIdentifiers(element),
      );

    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        property.type === "RestElement"
          ? bindingPatternIdentifiers(property.argument)
          : bindingPatternIdentifiers(property.value),
      );

    case "AssignmentPattern":
      return bindingPatternIdentifiers(pattern.left);

    case "RestElement":
      return bindingPatternIdentifiers(pattern.argument);
  }
}

function localExportName(name: ModuleExportName): {
  readonly type: "Identifier";
  readonly name: string;
} {
  if (name.type !== "Identifier") {
    throw new Error("Local export names must be identifiers");
  }

  return name;
}

function moduleExportName(name: ModuleExportName): IRModuleExportName {
  return name.type === "Identifier"
    ? moduleIdentifierName(name.name)
    : { kind: "string", value: name.value };
}

function moduleIdentifierName(name: string): IRModuleExportName {
  return { kind: "identifier", name };
}

function moduleAttributes(attributes: readonly ImportAttribute[]): ModuleAttribute[] {
  return attributes.map((attribute) => ({
    key: moduleExportName(attribute.key),
    value: attribute.value.value,
  }));
}

function isValueImportSpecifier(specifier: ImportDeclarationSpecifier): boolean {
  return specifier.type !== "ImportSpecifier" || specifier.importKind !== "type";
}

function isValueExportSpecifier(specifier: ExportSpecifier): boolean {
  return specifier.exportKind !== "type";
}
