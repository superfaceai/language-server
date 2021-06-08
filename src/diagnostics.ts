import * as superparser from '@superfaceai/parser';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface DiagnosticOptions {
  /** Specifies the maximum number of diagnostics to generate. */
  maxProblems?: number;
}
/**
 * Diagnoses given text document and returns the diagnostic results.
 */
export function diagnoseDocument(
  document: TextDocument,
  options?: DiagnosticOptions
): Diagnostic[] {
  const result: Diagnostic[] = [];

  try {
    if (document.languageId === 'slang-map') {
      superparser.parseMap(
        new superparser.Source(document.getText(), path.basename(document.uri))
      );
    } else {
      superparser.parseProfile(
        new superparser.Source(document.getText(), path.basename(document.uri))
      );
    }
  } catch (error) {
    if (!(error instanceof superparser.SyntaxError)) {
      throw new Error('superface parser threw an unexpected error');
    }

    const endLocation = superparser.computeEndLocation(
      error.source.body.slice(error.span.start, error.span.end),
      error.location
    );

    let message = error.detail;
    if (error.hint !== undefined) {
      message += `\n\n${error.hint}`
    };

    const diag: Diagnostic = {
      range: Range.create(
        error.location.line - 1,
        error.location.column - 1,
        endLocation.line - 1,
        endLocation.column - 1
      ),
      message,
      severity: DiagnosticSeverity.Error,
      source: error.category
    };
    result.push(diag);
  }

  return result.slice(0, options?.maxProblems ?? result.length);
}
