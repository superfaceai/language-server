import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { WithLocationInfo } from '@superfaceai/parser/dist/language/syntax/rules/common';
import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

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
  profile: WithLocationInfo<ProfileDocumentNode>,
  workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
  workContext?.workDoneProgress.begin('Gathering profile symbols');

  const fileSpan = profile.span;

  const namespaceSymbols = [];
  for (const definition of profile.definitions) {
    switch (definition.kind) {
      case 'UseCaseDefinition':
        {
          const usecaseSymbol = DocumentSymbol.create(
            definition.useCaseName,
            definition.title,
            SymbolKind.Interface,
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            []
          );
          namespaceSymbols.push(usecaseSymbol);
        }
        break;

      case 'NamedModelDefinition':
        {
          const modelSymbol = DocumentSymbol.create(
            definition.modelName,
            definition.title,
            SymbolKind.Interface,
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            []
          );
          namespaceSymbols.push(modelSymbol);
        }
        break;

      case 'NamedFieldDefinition':
        {
          const fieldSymbol = DocumentSymbol.create(
            definition.fieldName,
            definition.title,
            SymbolKind.Field,
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            []
          );
          namespaceSymbols.push(fieldSymbol);
        }
        break;
    }
  }

  const namespaceSymbol = DocumentSymbol.create(
    formatNamespace(
      profile.header.scope,
      profile.header.name,
      profile.header.version
    ),
    undefined,
    SymbolKind.Namespace,
    Range.create(
      document.positionAt(profile.header.span.start),
      document.positionAt(fileSpan.end)
    ),
    Range.create(
      document.positionAt(profile.header.span.start),
      document.positionAt(profile.header.span.start)
    ),
    namespaceSymbols
  );

  const fileSymbol = DocumentSymbol.create(
    fileNameFromUri(document.uri),
    undefined,
    SymbolKind.File,
    Range.create(
      document.positionAt(fileSpan.start),
      document.positionAt(fileSpan.end)
    ),
    Range.create(
      document.positionAt(fileSpan.start),
      document.positionAt(fileSpan.start)
    ),
    [namespaceSymbol]
  );

  workContext?.workDoneProgress.done();

  return [fileSymbol];
}

export function listMapSymbols(
  document: ComlinkDocument,
  map: WithLocationInfo<MapDocumentNode>,
  workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
  workContext?.workDoneProgress.begin('Gathering map symbols');

  const fileSpan = map.span;

  const namespaceSymbols = [];
  for (const definition of map.definitions) {
    switch (definition.kind) {
      case 'MapDefinition':
        {
          const mapSymbol = DocumentSymbol.create(
            definition.name,
            undefined,
            SymbolKind.Class,
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
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
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            Range.create(
              document.positionAt(definition.span.start),
              document.positionAt(definition.span.end)
            ),
            []
          );
          namespaceSymbols.push(operationSymbol);
        }
        break;
    }
  }

  const namespaceSymbol = DocumentSymbol.create(
    formatNamespace(
      map.header.profile.scope,
      map.header.profile.name,
      map.header.profile.version
    ),
    undefined,
    SymbolKind.Namespace,
    Range.create(
      document.positionAt(map.header.span.start),
      document.positionAt(fileSpan.end)
    ),
    Range.create(
      document.positionAt(map.header.span.start),
      document.positionAt(map.header.span.start)
    ),
    namespaceSymbols
  );

  const fileSymbol = DocumentSymbol.create(
    fileNameFromUri(document.uri),
    undefined,
    SymbolKind.File,
    Range.create(
      document.positionAt(fileSpan.start),
      document.positionAt(fileSpan.end)
    ),
    Range.create(
      document.positionAt(fileSpan.start),
      document.positionAt(fileSpan.start)
    ),
    [namespaceSymbol]
  );

  workContext?.workDoneProgress.done();

  return [fileSymbol];
}
