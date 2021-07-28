import { Span } from "@superfaceai/parser";
import { CancellationToken, ResultProgressReporter, WorkDoneProgressReporter } from "vscode-languageserver";
import { DocumentUri } from "vscode-languageserver-textdocument";

export type WorkContext<PartialResult = void> = {
	cancellationToken: CancellationToken,
	workDoneProgress: WorkDoneProgressReporter,
	resultProgress?: ResultProgressReporter<PartialResult>
};

export type Result<R, E> = {
	kind: 'success';
	value: R;
} | {
	kind: 'failure';
	error: E;
};

export function fileNameFromUri(uri: DocumentUri): string {
	const split = uri.split('/')
	const last = split[split.length - 1]

	return last
}

export function forceSpan(span: Span | undefined): Span {
	return {
		start: span?.start ?? 0,
		end: span?.end ?? 0
	}
}
