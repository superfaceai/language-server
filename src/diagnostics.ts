import * as superparser from '@superfaceai/parser';

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { parseDocument } from './document';

type DiagnosticOptions = {
  /** Specifies the maximum number of diagnostics to generate. */
  maxProblems?: number;
}

/**
 * Diagnoses given text document and returns the diagnostic results.
 * 
 * Returns `undefined` if the document id is not known.
 */
export function diagnoseDocument(
  document: TextDocument,
  options?: DiagnosticOptions
): Diagnostic[] {
  const result: Diagnostic[] = [];

  const parsed = parseDocument(document);
  if (parsed.kind === 'failure') {
    const error = parsed.error;

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
