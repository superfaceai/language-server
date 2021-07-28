import * as path from 'path';
import { promises as fsp } from 'fs';

import { ProfileDocumentNode, MapDocumentNode } from '@superfaceai/ast';
import * as superparser from '@superfaceai/parser';
import { parseRuleResult } from '@superfaceai/parser/dist/language/syntax/parser';
import { PROFILE_DOCUMENT } from '@superfaceai/parser/dist/language/syntax/rules/profile/profile';
import { MAP_DOCUMENT, SyntaxError } from '@superfaceai/parser';

import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { DocumentSymbol, Range, SymbolKind } from "vscode-languageserver-types";

import { Result, WorkContext, fileNameFromUri, forceSpan } from "./lib";
import { TextDocuments } from 'vscode-languageserver';

/**
 * Gets text document either from manager or by loading it from the disk.
 */
export async function getDocument(manager: TextDocuments<TextDocument>, uri: DocumentUri): Promise<TextDocument> {
	const managed = manager.get(uri)
    if (managed !== undefined) {
      return managed;
    }

    const text = await fsp.readFile(uri, { encoding: 'utf-8' });

	let languageId = 'plaintext';
	if (uri.endsWith('.supr')) {
		languageId = 'comlink-profile';
	} else if (uri.endsWith('.suma')) {
		languageId = 'comlink-map';
	}

    return TextDocument.create(uri, languageId, 0, text);
}

export function parseDocument(
	document: TextDocument,
	workContext?: WorkContext<unknown>
): Result<ProfileDocumentNode | MapDocumentNode, SyntaxError> {
	let source = new superparser.Source(document.getText(), path.basename(document.uri));
	
	let result;
	if (document.languageId === 'comlink-profile') {
		workContext?.workDoneProgress.begin('Parsing profile', 0, undefined, false);
		result = parseRuleResult(PROFILE_DOCUMENT, source);
		workContext?.workDoneProgress.done();
	} else if (document.languageId === 'comlink-map') {
		workContext?.workDoneProgress.begin('Parsing map', 0, undefined, false);
		result = parseRuleResult(MAP_DOCUMENT, source);
		workContext?.workDoneProgress.done();
	} else {
		throw new Error('unexpected language id');
	}

	return result;
}

export function listDocumentSymbols(
	document: TextDocument,
	workContext?: WorkContext<DocumentSymbol[]>
): Result<DocumentSymbol[], SyntaxError> {
	const parseResult = parseDocument(document, workContext);
	if (parseResult.kind === 'failure') {
		return parseResult;
	}
	const parsed = parseResult.value; 

	let symbols: DocumentSymbol[] = [];
	if (parsed.kind === 'ProfileDocument') {
		symbols = listProfileSymbols(document, parsed, workContext);
	}
	
	if (parsed.kind === 'MapDocument') {
		symbols = listMapSymbols(document, parsed, workContext);
	}

	return {
		kind: 'success',
		value: symbols
	};
}

function listProfileSymbols(
	document: TextDocument,
	profile: ProfileDocumentNode,
	workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
	workContext?.workDoneProgress.begin('Gathering profile symbols');

	const symbols = [];
	
	const fileSpan = forceSpan(profile.span);
	const fileSymbol = DocumentSymbol.create(
		fileNameFromUri(document.uri),
		undefined,
		SymbolKind.File,
		Range.create(
			document.positionAt(fileSpan.start),
			document.positionAt(fileSpan.end)
		),
		Range.create(
			document.positionAt(fileSpan.start),
			document.positionAt(fileSpan.start)
		),
		[]
	);
	symbols.push(fileSymbol);

	const namespaceSpan = forceSpan(profile.header.span);
	const namespaceSymbol = DocumentSymbol.create(
		profile.header.scope !== undefined ? `${profile.header.scope}/${profile.header.name}` : profile.header.name,
		undefined,
		SymbolKind.Namespace,
		Range.create(
			document.positionAt(namespaceSpan.start),
			document.positionAt(namespaceSpan.end)
		),
		Range.create(
			document.positionAt(namespaceSpan.start),
			document.positionAt(namespaceSpan.start)
		),
		[]
	)
	fileSymbol.children?.push(namespaceSymbol);

	for (const definition of profile.definitions) {
		switch (definition.kind) {
			case 'UseCaseDefinition':
				const usecaseSpan = forceSpan(definition.span);
				const usecaseSymbol = DocumentSymbol.create(
					definition.useCaseName,
					definition.title,
					SymbolKind.Module,
					Range.create(
						document.positionAt(usecaseSpan.start),
						document.positionAt(usecaseSpan.end)
					),
					Range.create(
						document.positionAt(usecaseSpan.start),
						document.positionAt(usecaseSpan.end)
					),
					[]
				);
				namespaceSymbol.children?.push(usecaseSymbol);
				break;
			
			case 'NamedModelDefinition':
				const modelSpan = forceSpan(definition.span);
				const modelSymbol = DocumentSymbol.create(
					definition.modelName,
					definition.title,
					SymbolKind.Interface,
					Range.create(
						document.positionAt(modelSpan.start),
						document.positionAt(modelSpan.end)
					),
					Range.create(
						document.positionAt(modelSpan.start),
						document.positionAt(modelSpan.end)
					),
					[]
				)
				namespaceSymbol.children?.push(modelSymbol);
				break;

			case 'NamedFieldDefinition':
				const fieldSpan = forceSpan(definition.span);
				const fieldSymbol = DocumentSymbol.create(
					definition.fieldName,
					definition.title,
					SymbolKind.Field,
					Range.create(
						document.positionAt(fieldSpan.start),
						document.positionAt(fieldSpan.end)
					),
					Range.create(
						document.positionAt(fieldSpan.start),
						document.positionAt(fieldSpan.end)
					),
					[]
				)
				namespaceSymbol.children?.push(fieldSymbol);
				break;
		}
	}

	workContext?.workDoneProgress.done();

	return symbols;
}

function listMapSymbols(
	_document: TextDocument,
	_map: MapDocumentNode,
	_workContext?: WorkContext<DocumentSymbol[]>
): DocumentSymbol[] {
	return []
}