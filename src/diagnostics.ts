import * as superparser from '@superfaceai/parser';
import { getProfileOutput, validateMap } from '@superfaceai/parser';
import { inspect } from 'util';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';

import { ComlinkDocument } from './document';
import { ComlinkDocuments } from './documents';

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

export function lintMap(
  map: ComlinkDocument,
  manager: ComlinkDocuments
): Diagnostic[] {
  const mapNamespaceResult = map.getNamespaceSymbol();
  if (mapNamespaceResult.kind === 'failure') {
    return diagnosticsFromSyntaxError(mapNamespaceResult.error);
  }
  const mapNamespace = mapNamespaceResult.value.name;

  const mapAst = map.getAst();
  if (mapAst.kind === 'failure' || mapAst.value.kind === 'ProfileDocument') {
    throw new Error('Unexpected state: Invalid map document');
  }

  const matchingProfile = manager.all().find(document => {
    if (document.languageId !== ComlinkDocument.PROFILE_LANGUAGE_ID) {
      return false;
    }

    const namespace = document.getNamespaceSymbol();
    if (namespace.kind === 'failure') {
      return false;
    }

    return namespace.value.name === mapNamespace;
  });

  if (matchingProfile === undefined) {
    return [];
  }

  const profileAst = matchingProfile.getAst();
  if (
    profileAst.kind === 'failure' ||
    profileAst.value.kind === 'MapDocument'
  ) {
    throw new Error('Unexpected state: Invalid profile document');
  }

  const profileOutput = getProfileOutput(profileAst.value);
  const validationResult = validateMap(profileOutput, mapAst.value);
  console.log(validationResult);

  const result: Diagnostic[] = [];

  const validationErrors =
    validationResult.pass === false ? validationResult.errors : [];
  for (const error of validationErrors) {
    const diag = Diagnostic.create(
      Range.create(0, 0, 0, 1024),
      `${error.kind}: ${inspect(error.context)}`,
      DiagnosticSeverity.Error
    );
    result.push(diag);
  }

  const validationWarnings = validationResult.warnings ?? [];
  for (const warning of validationWarnings) {
    const diag = Diagnostic.create(
      Range.create(0, 0, 0, 1024),
      `${warning.kind}: ${inspect(warning.context)}`,
      DiagnosticSeverity.Warning
    );
    result.push(diag);
  }

  return result;
}
