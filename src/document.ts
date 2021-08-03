import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import * as superparser from '@superfaceai/parser';
import { WithLocationInfo } from '@superfaceai/parser/dist/language/syntax/rules/common';
import * as path from 'path';
import {
  Diagnostic,
  DocumentSymbol,
  DocumentUri,
  SymbolKind,
  TextDocumentContentChangeEvent,
} from 'vscode-languageserver';
import {
  Position,
  Range,
  TextDocument,
} from 'vscode-languageserver-textdocument';

import {
  DiagnosticOptions,
  diagnosticsFromSyntaxError,
  lintMap,
} from './diagnostics';
import { ComlinkDocuments } from './documents';
import { Result, WorkContext } from './lib';
import { listMapSymbols, listProfileSymbols } from './symbols';

export class ComlinkDocument implements TextDocument {
  static PROFILE_EXTENSIONS = ['supr'];
  static MAP_EXTENSIONS = ['suma'];
  static PROFILE_LANGUAGE_ID = 'comlink-profile';
  static MAP_LANGUAGE_ID = 'comlink-map';

  static hasProfileExtension(path: string): boolean {
    return ComlinkDocument.PROFILE_EXTENSIONS.some(extension =>
      path.endsWith(`.${extension}`)
    );
  }

  static hasMapExtension(path: string): boolean {
    return ComlinkDocument.MAP_EXTENSIONS.some(extension =>
      path.endsWith(`.${extension}`)
    );
  }

  static create(
    uri: DocumentUri,
    languageId: string,
    version: number,
    content: string
  ): ComlinkDocument {
    return new ComlinkDocument(
      TextDocument.create(uri, languageId, version, content)
    );
  }

  private astCache?: Result<
    WithLocationInfo<ProfileDocumentNode> | WithLocationInfo<MapDocumentNode>,
    superparser.SyntaxError
  > = undefined;
  private symbolCache?: Result<DocumentSymbol[], superparser.SyntaxError> =
    undefined;

  constructor(private textDocument: TextDocument) {}

  update(changes: TextDocumentContentChangeEvent[], version: number): this {
    this.textDocument = TextDocument.update(
      this.textDocument,
      changes,
      version
    );
    this.clearCache();

    return this;
  }

  get uri(): DocumentUri {
    return this.textDocument.uri;
  }

  get languageId(): string {
    return this.textDocument.languageId;
  }

  get version(): number {
    return this.textDocument.version;
  }

  get lineCount(): number {
    return this.textDocument.lineCount;
  }

  getText(range?: Range): string {
    return this.textDocument.getText(range);
  }

  positionAt(offset: number): Position {
    return this.textDocument.positionAt(offset);
  }

  offsetAt(position: Position): number {
    return this.textDocument.offsetAt(position);
  }

  clearCache(): void {
    this.astCache = undefined;
    this.symbolCache = undefined;
  }

  getAst(
    workContext?: WorkContext<unknown>
  ): Result<
    WithLocationInfo<ProfileDocumentNode> | WithLocationInfo<MapDocumentNode>,
    superparser.SyntaxError
  > {
    if (this.astCache !== undefined) {
      return this.astCache;
    }

    const source = new superparser.Source(
      this.getText(),
      path.basename(this.uri)
    );

    let result: Result<
      WithLocationInfo<ProfileDocumentNode> | WithLocationInfo<MapDocumentNode>,
      superparser.SyntaxError
    >;
    if (this.languageId === ComlinkDocument.PROFILE_LANGUAGE_ID) {
      workContext?.workDoneProgress.begin(
        'Parsing profile',
        0,
        undefined,
        false
      );
      result = superparser.parse.parseRuleResult(
        superparser.profileRules.PROFILE_DOCUMENT,
        source
      );
      workContext?.workDoneProgress.done();
    } else if (this.languageId === ComlinkDocument.MAP_LANGUAGE_ID) {
      workContext?.workDoneProgress.begin('Parsing map', 0, undefined, false);
      result = superparser.parse.parseRuleResult(
        superparser.mapRules.MAP_DOCUMENT,
        source
      );
      workContext?.workDoneProgress.done();
    } else {
      throw new Error('unexpected language id');
    }

    this.astCache = result;

    return result;
  }

  getDiagnostics(
    manager: ComlinkDocuments,
    options?: DiagnosticOptions,
    workContext?: WorkContext<Diagnostic[]>
  ): Diagnostic[] {
    const result: Diagnostic[] = [];

    const parsed = this.getAst(workContext);
    if (parsed.kind === 'failure') {
      result.push(...diagnosticsFromSyntaxError(parsed.error));
    } else if (parsed.value.kind === 'MapDocument') {
      result.push(...lintMap(this, manager));
    }

    return result.slice(0, options?.maxProblems ?? result.length);
  }

  getSymbols(
    workContext?: WorkContext<DocumentSymbol[]>
  ): Result<DocumentSymbol[], superparser.SyntaxError> {
    if (this.symbolCache !== undefined) {
      return this.symbolCache;
    }

    let result: Result<DocumentSymbol[], superparser.SyntaxError>;

    const astResult = this.getAst(workContext);
    if (astResult.kind === 'failure') {
      result = astResult;
    } else {
      const ast = astResult.value;

      let symbols: DocumentSymbol[] = [];
      if (ast.kind === 'ProfileDocument') {
        symbols = listProfileSymbols(this, ast, workContext);
      } else if (ast.kind === 'MapDocument') {
        symbols = listMapSymbols(this, ast, workContext);
      }

      result = {
        kind: 'success',
        value: symbols,
      };
    }

    this.symbolCache = result;

    return result;
  }

  getNamespaceSymbol(
    workContext?: WorkContext<DocumentSymbol>
  ): Result<DocumentSymbol, superparser.SyntaxError> {
    let wc = undefined;
    if (workContext !== undefined) {
      wc = {
        cancellationToken: workContext.cancellationToken,
        workDoneProgress: workContext.workDoneProgress,
      };
    }
    const symbols = this.getSymbols(wc);
    if (symbols.kind === 'failure') {
      return symbols;
    }

    const namespaceSymbol = symbols.value[0].children?.[0];
    if (
      namespaceSymbol === undefined ||
      namespaceSymbol.kind !== SymbolKind.Namespace
    ) {
      throw new Error('Unexpected document symbol structure');
    }

    return { kind: 'success', value: namespaceSymbol };
  }
}
