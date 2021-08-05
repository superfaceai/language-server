import * as superparser from '@superfaceai/parser';
import { formatIssueContext, getProfileOutput, validateMap, ValidationIssue } from '@superfaceai/parser';
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';

import { unwrapResult } from './lib';

export type DiagnosticOptions = {
  /** Specifies the maximum number of diagnostics to generate. */
  maxProblems?: number;
};

export function diagnosticsFromSyntaxError(
  error: superparser.SyntaxError
): Diagnostic[] {
  const result: Diagnostic[] = [];

  const endLocation = superparser.computeEndLocation(
    error.source.body.slice(error.span.start, error.span.end),
    error.location
  );

  let message = error.detail;
  if (error.hint !== undefined) {
    message += `\n\n${error.hint}`;
  }

  const diag: Diagnostic = {
    range: Range.create(
      error.location.line - 1,
      error.location.column - 1,
      endLocation.line - 1,
      endLocation.column - 1
    ),
    message,
    severity: DiagnosticSeverity.Error,
    source: error.category,
  };
  result.push(diag);

  return result;
}

function parseLinterPath(path?: string[]): { position: Position, rest: string[] } {
  if (path === undefined || path.length === 0) {
    return { position: Position.create(0, 0), rest: [] }
  }

  let position = Position.create(0, 0);
  try {
    const split = path[0].split(':');
    const line = parseInt(split[0]);
    const column = parseInt(split[1]);

    position = Position.create(line - 1, column - 1);
  } catch (e: unknown) {}

  return {
    position,
    rest: path.slice(1)
  }
}

function diagnosticFromValidationIssue(issue: ValidationIssue, severity?: DiagnosticSeverity): Diagnostic {
  const { position } = parseLinterPath(issue.context.path);
    
  const diag = Diagnostic.create(
    Range.create(position, position),
    formatIssueContext(issue),
    severity,
    issue.kind
  );

  return diag;
}

export function lintMap(
  map: ComlinkDocument,
  manager: ComlinkDocuments
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

  // result formatting
  const result: Diagnostic[] = (validationResult.pass === false ? validationResult.errors : []).map(
    error => diagnosticFromValidationIssue(error, DiagnosticSeverity.Error)
  ).concat(
    (validationResult.warnings ?? []).map(
      warning => diagnosticFromValidationIssue(warning, DiagnosticSeverity.Warning)
    )
  );

  return result;
}
