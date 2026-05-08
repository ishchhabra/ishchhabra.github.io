import type { ModuleAttribute, ModuleExportName } from "../../../ir/core/ModuleName";
import type { ModuleExport } from "../../../ir/core/ModuleExport";
import type { ModuleImport } from "../../../ir/core/ModuleImport";
import type { ModuleIR } from "../../../ir/core/ModuleIR";
import {
  exportAllDeclaration,
  exportNamedDeclaration,
  exportSpecifier,
  identifier,
  importAttribute,
  importDeclaration,
  importDefaultSpecifier,
  importNamespaceSpecifier,
  importSpecifier,
  literal,
  type ESTreeStatement,
  type IdentifierNode,
  type ImportAttributeNode,
  type LiteralNode,
} from "../ast";
import type { CodegenContext } from "../CodegenContext";

/**
 * Emits static module linkage records.
 *
 * Imports are emitted before the executable module body. Exports are emitted
 * after the body as normalized export specifiers, so declaration lowering can
 * stay independent from module surface metadata.
 */
export function emitModuleImports(moduleIR: ModuleIR): ESTreeStatement[] {
  return moduleIR.imports.map(emitModuleImport);
}

export function emitModuleExports(context: CodegenContext, moduleIR: ModuleIR): ESTreeStatement[] {
  return moduleIR.exports.flatMap((record) => emitModuleExport(context, record));
}

function emitModuleImport(record: ModuleImport): ESTreeStatement {
  switch (record.kind) {
    case "bare":
      return importDeclaration([], record.source, emitModuleAttributes(record.attributes));

    case "default":
      return importDeclaration(
        [importDefaultSpecifier(identifier(record.localName))],
        record.source,
        emitModuleAttributes(record.attributes),
      );

    case "namespace":
      return importDeclaration(
        [importNamespaceSpecifier(identifier(record.localName))],
        record.source,
        emitModuleAttributes(record.attributes),
      );

    case "named":
      return importDeclaration(
        [importSpecifier(emitModuleName(record.importedName), identifier(record.localName))],
        record.source,
        emitModuleAttributes(record.attributes),
      );
  }
}

function emitModuleExport(context: CodegenContext, record: ModuleExport): ESTreeStatement[] {
  switch (record.kind) {
    case "local":
      return [
        exportNamedDeclaration([
          exportSpecifier(
            identifier(context.names.declarationName(record.declarationId)),
            emitModuleName(record.exportedName),
          ),
        ]),
      ];

    case "default-local":
      return [
        exportNamedDeclaration([
          exportSpecifier(
            identifier(context.names.declarationName(record.declarationId)),
            identifier("default"),
          ),
        ]),
      ];

    case "default-value":
      return [];

    case "re-export":
      return [
        exportNamedDeclaration(
          [
            exportSpecifier(
              emitModuleName(record.importedName),
              emitModuleName(record.exportedName),
            ),
          ],
          record.source,
          emitModuleAttributes(record.attributes),
        ),
      ];

    case "export-all":
      return [
        exportAllDeclaration(
          record.source,
          record.exportedName === null ? null : emitModuleName(record.exportedName),
          emitModuleAttributes(record.attributes),
        ),
      ];
  }
}

function emitModuleName(name: ModuleExportName): IdentifierNode | LiteralNode {
  return name.kind === "identifier" ? identifier(name.name) : literal(name.value);
}

function emitModuleAttributes(attributes: readonly ModuleAttribute[]): ImportAttributeNode[] {
  return attributes.map((attribute) =>
    importAttribute(emitModuleName(attribute.key), attribute.value),
  );
}
