import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { WithLocation } from '@superfaceai/parser/dist/language/syntax/rules/common';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver-types';

import { ComlinkDocument } from './document';
import { fileNameFromUri, WorkContext } from './lib';

function formatNamespace(
  scope: string | undefined,
  name: string,
  version: { major: number; minor: number }
): string {
  let namespace = `${name}@${version.major}.${version.minor}`;
  if (scope !== undefined) {
    namespace = `${scope}/${namespace}`;
  }

  return namespace;
}

export function listProfileSymbols(
  document: ComlinkDocument,
  profile: WithLocation<ProfileDocumentNode>,
  workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
  workContext?.workDoneProgress.begin('Gathering profile symbols');

  const namespaceSymbols = [];
  for (const definition of profile.definitions) {
    // TODO: improve (selection) ranges
    const definitionRange = document.rangeFromSpan(
      definition.location.start.charIndex,
      definition.location.end.charIndex
    );

    switch (definition.kind) {
      case 'UseCaseDefinition':
        {
          const usecaseSymbol = DocumentSymbol.create(
            definition.useCaseName,
            definition.documentation?.title,
            SymbolKind.Interface,
            definitionRange,
            definitionRange,
            []
          );
          namespaceSymbols.push(usecaseSymbol);
        }
        break;

      case 'NamedModelDefinition':
        {
          const modelSymbol = DocumentSymbol.create(
            definition.modelName,
            definition.documentation?.title,
            SymbolKind.Interface,
            definitionRange,
            definitionRange,
            []
          );
          namespaceSymbols.push(modelSymbol);
        }
        break;

      case 'NamedFieldDefinition':
        {
          const fieldSymbol = DocumentSymbol.create(
            definition.fieldName,
            definition.documentation?.title,
            SymbolKind.Field,
            definitionRange,
            definitionRange,
            []
          );
          namespaceSymbols.push(fieldSymbol);
        }
        break;
    }
  }

  const fileSpan = {
    start: profile.location.start.charIndex,
    end: profile.location.end.charIndex,
  };

  const namespaceSymbol = DocumentSymbol.create(
    formatNamespace(
      profile.header.scope,
      profile.header.name,
      profile.header.version
    ),
    undefined,
    SymbolKind.Namespace,
    document.rangeFromSpan(
      profile.header.location.start.charIndex,
      fileSpan.end
    ),
    document.rangeFromSpan(
      profile.header.location.start.charIndex,
      fileSpan.end
    ),
    namespaceSymbols
  );

  const fileSymbol = DocumentSymbol.create(
    fileNameFromUri(document.uri),
    undefined,
    SymbolKind.File,
    document.rangeFromSpan(fileSpan.start, fileSpan.end),
    document.rangeFromSpan(fileSpan.start, fileSpan.end),
    [namespaceSymbol]
  );

  workContext?.workDoneProgress.done();

  return [fileSymbol];
}

export function listMapSymbols(
  document: ComlinkDocument,
  map: WithLocation<MapDocumentNode>,
  workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
  workContext?.workDoneProgress.begin('Gathering map symbols');

  const namespaceSymbols = [];
  for (const definition of map.definitions) {
    const definitionRange = document.rangeFromSpan(
      definition.location.start.charIndex,
      definition.location.end.charIndex
    );

    switch (definition.kind) {
      case 'MapDefinition':
        {
          const mapSymbol = DocumentSymbol.create(
            definition.name,
            undefined,
            SymbolKind.Class,
            definitionRange,
            definitionRange,
            []
          );
          namespaceSymbols.push(mapSymbol);
        }
        break;

      case 'OperationDefinition':
        {
          const operationSymbol = DocumentSymbol.create(
            definition.name,
            undefined,
            SymbolKind.Function,
            definitionRange,
            definitionRange,
            []
          );
          namespaceSymbols.push(operationSymbol);
        }
        break;
    }
  }

  const fileSpan = {
    start: map.location.start.charIndex,
    end: map.location.end.charIndex,
  };

  const namespaceSymbol = DocumentSymbol.create(
    formatNamespace(
      map.header.profile.scope,
      map.header.profile.name,
      map.header.profile.version
    ),
    undefined,
    SymbolKind.Namespace,
    document.rangeFromSpan(map.header.location.start.charIndex, fileSpan.end),
    document.rangeFromSpan(map.header.location.start.charIndex, fileSpan.end),
    namespaceSymbols
  );

  const fileSymbol = DocumentSymbol.create(
    fileNameFromUri(document.uri),
    undefined,
    SymbolKind.File,
    document.rangeFromSpan(fileSpan.start, fileSpan.end),
    document.rangeFromSpan(fileSpan.start, fileSpan.end),
    [namespaceSymbol]
  );

  workContext?.workDoneProgress.done();

  return [fileSymbol];
}
