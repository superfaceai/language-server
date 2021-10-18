import util from 'util';
import {
  Connection,
  createConnection,
  DefinitionLink,
  DocumentSymbol,
  InitializeResult,
  ProposedFeatures,
  SymbolInformation,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';
import { stripUriPrefix, WorkContext } from './lib';
import { listWorkspaceSymbols, loadWorkspaceDocuments } from './workspace';

/**
 * Entry point class to the server.
 *
 * Contains initialization and utility methods with common functionality.
 */
class ServerContext {
  static SERVER_INFO = {
    name: 'Superface Language Server',
  };

  /** LSP connection on which we listen */
  readonly connection: Connection;
  /** Manager for open text documents */
  readonly documents: ComlinkDocuments;

  private readonly startTimestamp: number;

  /** Global promise that is queued here from sync context and awaited from async context later. */
  private globalPromise: Promise<void> | undefined;

  constructor() {
    this.connection = createConnection(ProposedFeatures.all);
    this.documents = new ComlinkDocuments();

    this.startTimestamp = Date.now();

    this.bindEventsConnection();
    this.bindEventsDocuments();
  }

  // INITIALIZATION //

  private bindEventsConnection() {
    this.connection.onInitialize(async event => {
      this.conLog('onInitialize:', event);

      const result: InitializeResult = {
        capabilities: {
          // Document syncing is handled by the TextDocuments handler anyway
          textDocumentSync: {
            openClose: true,
            change: TextDocumentSyncKind.Incremental,
            willSave: true,
            willSaveWaitUntil: true,
            save: {
              includeText: false,
            },
          },
          documentSymbolProvider: true,
          workspaceSymbolProvider: true,
          workspace: {
            workspaceFolders: {
              supported: true,
            },
          },
          // definitionProvider: true
        },
        serverInfo: ServerContext.SERVER_INFO,
      };

      await this.loadWorkspace();

      return result;
    });

    this.connection.onDocumentSymbol(
      async (event, cancellationToken, workDoneProgress, resultProgress) => {
        this.conLog(`onDocumentSymbol(${event.textDocument.uri})`);

        const workContext: WorkContext<DocumentSymbol[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress,
        };

        const document = await this.documents.loadDocument(
          event.textDocument.uri
        );

        if (!document.isCached()) {
          void this.diagnoseDocument(document);
        }

        const symbols = document.getSymbols(workContext);
        if (symbols.kind === 'failure') {
          return undefined;
        }

        return symbols.value;
      }
    );

    this.connection.onWorkspaceSymbol(
      async (event, cancellationToken, workDoneProgress, resultProgress) => {
        this.conLog(`onWorkspaceSymbol(${event.query})`);

        await this.awaitGlobalPromise();

        const workContext: WorkContext<SymbolInformation[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress,
        };

        const symbols = listWorkspaceSymbols(this.documents, workContext);

        return symbols;
      }
    );

    this.connection.onDefinition(
      async (event, cancellationToken, workDoneProgress, resultProgress) => {
        this.conLog(`onDefinition(${event.textDocument.uri})`);

        const workContext: WorkContext<DefinitionLink[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress,
        };
        void workContext;

        await this.awaitGlobalPromise();

        return null; // TODO
      }
    );
  }

  private bindEventsDocuments() {
    this.connection.onDidOpenTextDocument(event => {
      this.conLog(`onDidOpenTextDocument(${event.textDocument.uri})`);

      const document = this.documents.create(
        event.textDocument.uri,
        event.textDocument.languageId,
        event.textDocument.version,
        event.textDocument.text
      );

      this.queueGlobalPromise(this.loadWorkspace());

      void this.diagnoseDocument(document);
    });

    this.connection.onDidChangeTextDocument(event => {
      this.conLog(`onDidChangeTextDocument(${event.textDocument.uri})`);

      if (event.contentChanges.length === 0) {
        return;
      }

      const document = this.documents.update(
        event.textDocument.uri,
        event.contentChanges,
        event.textDocument.version
      );

      void this.diagnoseDocument(document);
    });

    this.connection.onDidCloseTextDocument(event => {
      this.conLog(`onDidCloseTextDocument(${event.textDocument.uri})`);

      this.documents.remove(event.textDocument.uri);
    });
  }

  /**
   * Begins listening on the connection.
   */
  listen() {
    this.connection.listen();
  }

  // LOGIC //

  private queueGlobalPromise(promise: Promise<void>) {
    if (this.globalPromise === undefined) {
      this.globalPromise = promise;
    } else {
      this.globalPromise = Promise.all([this.globalPromise, promise]).then(
        _ => undefined
      );
    }
  }

  private async awaitGlobalPromise() {
    if (this.globalPromise !== undefined) {
      await this.globalPromise;
      this.globalPromise = undefined;
    }
  }

  private async loadWorkspace(): Promise<void> {
    const promise = this.connection.workspace
      .getWorkspaceFolders()
      .then(folders => (folders ?? []).map(f => stripUriPrefix(f.uri)))
      .then(folders => loadWorkspaceDocuments(folders, this.documents))
      .catch(err => this.conLog('Failed to load workspace documents:', err));

    return promise;
  }

  private async diagnoseDocument(document: ComlinkDocument): Promise<void> {
    await this.awaitGlobalPromise();

    const diagnostics = document.getDiagnostics(this.documents, undefined, {
      log: this.conLog.bind(this),
    });
    this.conLog('Sending diagnostics:', diagnostics);
    this.connection.sendDiagnostics({ uri: document.uri, diagnostics });
  }

  // UTILITY //

  /**
   * Generates a string timestamp for log output.
   */
  timestampNow(): string {
    const elapsed = Date.now() - this.startTimestamp;

    const millis = elapsed % 1000;
    const seconds = (elapsed % (1000 * 60)) - millis;
    const minutes = elapsed - seconds - millis;

    const millisStr = millis.toString().padStart(3, '0');
    const secondsStr = seconds.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(3, '0');

    return `${minutesStr}:${secondsStr}.${millisStr}`;
  }

  /**
   * Logs the message into the connection channel and formats it with server process info.
   */
  conLog(...values: unknown[]) {
    const processed = values
      .map(value => {
        let message: string;
        if (typeof value === 'object') {
          message = util.inspect(value, {
            showHidden: false,
            depth: 5,
            colors: false,
          });
        } else {
          message = (value as { toString: () => string }).toString();
        }

        return message;
      })
      .join(' ');

    this.connection.console.log(
      `[+${this.timestampNow()}](pid ${process.pid}) ${processed}`
    );
  }
}

const ctx = new ServerContext();
ctx.listen();
