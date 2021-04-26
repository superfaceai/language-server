import util from 'util';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  Connection,
  createConnection,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { diagnoseDocument } from './diagnostics';

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

    this.bindEventsDocuments();
    this.bindEventsConnection();
  }

  // INITIALIZATION //

  private bindEventsConnection() {
    this.connection.onInitialize(params => {
      this.conLogWith('Received to initialization', params);

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
        },
        serverInfo: ServerContext.SERVER_INFO,
      };
      this.conLogWith('Responding to initialization', result);

      return result;
    });
  }

  private bindEventsDocuments() {
    this.documents.onDidOpen(event => {
      this.conLog(`Document opened ${event.document.uri}`);
    });

    this.documents.onDidChangeContent((event): void => {
      this.conLog(`Document changed ${event.document.uri}`);

      if (
        event.document.languageId !== 'slang-map' &&
        event.document.languageId !== 'slang-profile'
      ) {
        this.conLog('Ignoring document because it is not a slang document');

        return;
      }

      const diagnostics = diagnoseDocument(event.document);
      this.conLogWith('Sending diagnostics', diagnostics);
      this.connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics,
      });
    });

    this.documents.onDidClose(event => {
      this.conLog(`Document closed ${event.document.uri}`);
    });
  }

  // LOGIC //

  /**
   * Begins listening on the connection.
   */
  listen() {
    this.documents.listen(this.connection);
    this.connection.listen();
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
    this.conLog(`${message} with ${inspected}`);
  }
}

const ctx = new ServerContext();
ctx.listen();
