import * as superface from '@superfaceai/superface-parser';
import * as path from 'path';
import { Diagnostic, Range } from 'vscode-languageserver';
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
    superface.parseMap(
      new superface.Source(document.getText(), path.basename(document.uri))
    );
  } catch (error) {
    if (!(error instanceof superface.SyntaxError)) {
      throw new Error('superface parser threw an unexpected error');
    }

    const endLocation = superface.Location.computeEndLocation(
      error.source.body.slice(error.span.start, error.span.end),
      error.location
    );
    const diag: Diagnostic = {
      range: Range.create(
        error.location.line - 1,
        error.location.column - 1,
        endLocation.line - 1,
        endLocation.column - 1
      ),
      message: error.detail,
    };
    result.push(diag);
  }

  return result.slice(0, options?.maxProblems ?? result.length);
}
