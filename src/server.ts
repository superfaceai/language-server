import util from 'util';

import { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';
import {
  Connection,
  createConnection,
  DocumentSymbol,
  InitializeResult,
  ProposedFeatures,
  SymbolInformation,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { diagnoseDocument } from './diagnostics';
import { getDocument, listDocumentSymbols } from './document';
import { WorkContext } from './lib';

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
  readonly documents: TextDocuments<TextDocument>;

  private readonly startTimestamp: number;

  constructor() {
    this.connection = createConnection(ProposedFeatures.all);
    this.documents = new TextDocuments(TextDocument);

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
      async (params, cancellationToken, workDoneProgress, resultProgress) => {
        this.conLog(`onDocumentSymbol(${params.textDocument.uri})`);

        const workContext: WorkContext<DocumentSymbol[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress
        };

        const document = await getDocument(this.documents, params.textDocument.uri);
        const symbols = listDocumentSymbols(document, workContext);
        if (symbols.kind === 'failure') {
          return undefined;
        }
        
        this.conLogWith(`onDocumentSymbol(${params.textDocument.uri})`, symbols.value);
        return symbols.value;
      }
    );

    this.connection.onWorkspaceSymbol(
      async (params, cancellationToken, workDoneProgress, resultProgress) => {
        this.conLog(`onWorkspaceSymbol(${params.query})`);

        const _workContext: WorkContext<SymbolInformation[]> = {
          cancellationToken,
          workDoneProgress,
          resultProgress
        };
        void _workContext;

        this.conLogWith('getWorkspaceFolders', await this.connection.workspace.getWorkspaceFolders());

        return null; // TODO
      }
    );
  }

  private bindEventsDocuments() {
    this.documents.onDidOpen(event => {
      this.conLog(`onDidOpen(${event.document.uri})`);
    });

    this.documents.onDidChangeContent((event): void => {
      this.conLog(`onDidChangeContent(${event.document.uri})`);
      this.diagnoseDocument(event.document.uri);
    });

    this.documents.onDidClose(event => {
      this.conLog(`onDidClose(${event.document.uri})`);
    });
  }

  /**
   * Begins listening on the connection.
   */
   listen() {
    this.documents.listen(this.connection);
    this.connection.listen();
  }

  // LOGIC //

  private async diagnoseDocument(uri: DocumentUri): Promise<void> {
    const document = await getDocument(this.documents, uri);
    const diagnostics = diagnoseDocument(document);

    if (diagnostics !== undefined) {
      this.conLogWith('Sending diagnostics', diagnostics);
      this.connection.sendDiagnostics(
        { uri, diagnostics }
      );
    }
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
