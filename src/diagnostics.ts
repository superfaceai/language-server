import * as superparser from '@superfaceai/parser';
import {
  formatIssueContext,
  getProfileOutput,
  validateMap,
  ValidationIssue,
} from '@superfaceai/parser';
import { inspect } from 'util';
import {
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
} from 'vscode-languageserver';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';
import { LogFn, unwrapResult } from './lib';

export type DiagnosticOptions = {
  /** Specifies the maximum number of diagnostics to generate. */
  maxProblems?: number;
};

export function diagnosticsFromSyntaxError(
  error: superparser.SyntaxError
): Diagnostic[] {
  const result: Diagnostic[] = [];

  let message = error.detail;
  if (error.hint !== undefined) {
    message += `\n\n${error.hint}`;
  }

  const diag: Diagnostic = {
    range: Range.create(
      error.location.start.line - 1,
      error.location.start.column - 1,
      error.location.end.line - 1,
      error.location.end.column - 1
    ),
    message,
    severity: DiagnosticSeverity.Error,
    source: error.category,
  };
  result.push(diag);

  return result;
}

function diagnosticFromValidationIssue(
  issue: ValidationIssue,
  severity?: DiagnosticSeverity
): Diagnostic {
  const { location } = issue.context.path;
  const range = location
    ? Range.create(
        location.start.line - 1,
        location.start.column - 1,
        location.end.line - 1,
        location.end.column - 1
      )
    : Range.create(Position.create(0, 0), Position.create(0, 0));

  const diag = Diagnostic.create(
    range,
    formatIssueContext(issue),
    severity,
    issue.kind
  );

  return diag;
}

export function lintMap(
  map: ComlinkDocument,
  manager: ComlinkDocuments,
  context?: { log?: LogFn }
): Diagnostic[] {
  // namespace
  const mapNamespaceResult = map.getNamespace();
  if (mapNamespaceResult.kind === 'failure') {
    return diagnosticsFromSyntaxError(mapNamespaceResult.error);
  }
  const mapNamespace = mapNamespaceResult.value;

  // map ast
  const mapAst = unwrapResult(map.getAst());
  if (mapAst.kind === 'ProfileDocument') {
    throw new Error('Unexpected state: Invalid map document');
  }

  // profile search
  const matchingProfile = manager.all().find(document => {
    if (document.languageId !== ComlinkDocument.PROFILE_LANGUAGE_ID) {
      return false;
    }

    const namespace = document.getNamespace();
    if (namespace.kind === 'failure') {
      return false;
    }

    return namespace.value === mapNamespace;
  });

  if (matchingProfile === undefined) {
    return [];
  }

  // profile ast
  const profileAst = unwrapResult(matchingProfile.getAst());
  if (profileAst.kind === 'MapDocument') {
    throw new Error('Unexpected state: Invalid profile document');
  }

  // lint
  const profileOutput = getProfileOutput(profileAst);
  const validationResult = validateMap(profileOutput, mapAst);

  context?.log?.('Validation result:', inspect(validationResult, true, 5));

  // result formatting
  const result: Diagnostic[] = (
    validationResult.pass === false ? validationResult.errors : []
  )
    .map(error =>
      diagnosticFromValidationIssue(error, DiagnosticSeverity.Error)
    )
    .concat(
      (validationResult.warnings ?? []).map(warning =>
        diagnosticFromValidationIssue(warning, DiagnosticSeverity.Warning)
      )
    );

  return result;
}
