import { DocumentSymbol, SymbolInformation } from 'vscode-languageserver-types';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';
import { recursiveWalk, WalkEntry, WorkContext } from './lib';

/**
 * Walks over the provided folders and ensures that all documents are loaded in the manager.
 */
export async function loadWorkspaceDocuments(
  folders: string[],
  manager: ComlinkDocuments,
  workContext?: WorkContext<unknown>
): Promise<void> {
  const entryCallback = async (entry: WalkEntry) => {
    if (!entry.isFile) {
      return;
    }

    if (
      !ComlinkDocument.hasProfileExtension(entry.path) &&
      !ComlinkDocument.hasMapExtension(entry.path)
    ) {
      return;
    }

    await manager.loadDocument(entry.path);
  };

  // TODO: Can be cancellable - throw custom exception in the callback and catch it here
  workContext?.workDoneProgress.begin(
    'Walking workspace dirs...',
    0,
    undefined,
    false
  );
  await Promise.all(
    folders.map(folder => recursiveWalk(folder, entryCallback))
  );
  workContext?.workDoneProgress.done();
}

export function listWorkspaceSymbols(
  manager: ComlinkDocuments,
  workContext?: WorkContext<SymbolInformation[]>
): SymbolInformation[] {
  let wc: WorkContext<DocumentSymbol[]> | undefined = undefined;
  if (workContext !== undefined) {
    wc = {
      cancellationToken: workContext.cancellationToken,
      workDoneProgress: workContext.workDoneProgress,
    };
  }

  const symbols = manager.all().flatMap(document => {
    const symbols = document.getSymbols(wc);
    if (symbols.kind === 'failure') {
      return [];
    } else {
      return symbols.value;
    }
  });

  void symbols;

  return []; // TODO: reformat document symbols into symbol information
}
