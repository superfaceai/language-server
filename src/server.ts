import util from 'util';
import {
  Connection,
  createConnection,
  DocumentSymbol,
  InitializeResult,
  ProposedFeatures,
  SymbolInformation,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';
import { stripUriPrefix, WorkContext } from './lib';
import { loadWorkspaceDocuments } from './workspace';

/**
 * Entry point class to the server.
 *
 * Contains initialization and utility methods with common functionality.
 */
class ServerContext {
  static SERVER_INFO = {
    name: 'Superface Language Server',
    // TOOD: Include this and introduce the constraint to keep it in sync with package.json or leave it out?
    // version: "0.0.1"
  };

  /** LSP connection on which we listen */
  readonly connection: Connection;
  /** Manager for open text documents */
  readonly documents: ComlinkDocuments;

  private readonly startTimestamp: number;
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
    this.connection.onInitialize(params => {
      this.conLogWith('onInitialize', params);

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
          // workspace: {
          //   workspaceFolders: {
          //     supported: true
          //   }
          // }
        },
        serverInfo: ServerContext.SERVER_INFO,
      };
      this.conLogWith('onInitialize result', result);

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

        const _workContext: WorkContext<SymbolInformation[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress,
        };
        void _workContext;

        this.conLogWith(
          'getWorkspaceFolders',
          await this.connection.workspace.getWorkspaceFolders()
        );

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
      .catch(err => this.conLogWith('Failed to load workspace documents', err));

    return promise;
  }

  private async diagnoseDocument(document: ComlinkDocument): Promise<void> {
    await this.awaitGlobalPromise();

    const diagnostics = document.getDiagnostics(this.documents);
    this.conLogWith('Sending diagnostics', diagnostics);
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
  conLog(message: string) {
    this.connection.console.log(
      `[+${this.timestampNow()}](pid ${process.pid}) ${message}`
    );
  }

  /**
   * Logs the message to the connection log and appends `util.inspect(obj)` output.
   */
  conLogWith(message: string, obj: unknown) {
    const inspected = util.inspect(obj, {
      showHidden: false,
      depth: 5,
      colors: false,
    });
    this.conLog(`${message}: ${inspected}`);
  }
}

const ctx = new ServerContext();
ctx.listen();
