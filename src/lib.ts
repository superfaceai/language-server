import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';
import {
  CancellationToken,
  ResultProgressReporter,
  WorkDoneProgressReporter,
} from 'vscode-languageserver';
import { DocumentUri } from 'vscode-languageserver-textdocument';

export type LogFn = (...values: unknown[]) => void;

export type WorkContext<PartialResult = void> = {
  cancellationToken: CancellationToken;
  workDoneProgress: WorkDoneProgressReporter;
  resultProgress?: ResultProgressReporter<PartialResult>;
};

export type Result<T, E> =
  | {
      kind: 'success';
      value: T;
    }
  | {
      kind: 'failure';
      error: E;
    };

export function unwrapResult<T, E>(result: Result<T, E>): T {
  if (result.kind === 'failure') {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Expected success but found failure: ${result.error}`);
  }

  return result.value;
}

export function fileNameFromUri(uri: DocumentUri): string {
  const split = uri.split('/');
  const last = split[split.length - 1];

  return last;
}

export function stripUriPrefix(uri: DocumentUri): string {
  const FILE_PREFIX = 'file://';

  if (uri.startsWith(FILE_PREFIX)) {
    return uri.slice(FILE_PREFIX.length);
  }

  return uri;
}

export type WalkEntry = {
  isBlockDevice: boolean;
  isCharacterDevice: boolean;
  isFIFO: boolean;
  isFile: boolean;
  isSocket: boolean;
  isSymbolicLink: boolean;
  path: string;
};
export async function recursiveWalk(
  basePath: string,
  callback: (entry: WalkEntry) => Promise<void>
): Promise<void> {
  const entryPromises = await fsp
    .readdir(basePath, { withFileTypes: true })
    .then(entries =>
      entries.map(entry => {
        const entryPath = joinPath(basePath, entry.name);
        if (entry.isDirectory()) {
          return recursiveWalk(entryPath, callback);
        } else {
          const result = {
            get isBlockDevice(): boolean {
              return entry.isBlockDevice();
            },
            get isCharacterDevice(): boolean {
              return entry.isCharacterDevice();
            },
            get isFIFO(): boolean {
              return entry.isFIFO();
            },
            get isFile(): boolean {
              return entry.isFile();
            },
            get isSocket(): boolean {
              return entry.isSocket();
            },
            get isSymbolicLink(): boolean {
              return entry.isSymbolicLink();
            },
            path: entryPath,
          };

          return callback(result);
        }
      })
    );

  await Promise.all(entryPromises);
}

// /** Returns a traversal path the deepest token that contains the `position`. */
// export function tokenPathToPosition(position: number, node: WithLocationInfo<ProfileASTNode | MapASTNode>): ASTNodeBase[] {
//   if (node.span.start > position || node.span.end < position) {
//     return [];
//   }

//   const path = [node];

//   switch (node.kind) {
//     case 'MapDocument':
//       path += tokenPathToPosition(position, node.header);
//       path += node.definitions.map(
//         def => tokenPathToPosition(position, def)
//       );
//       break;

//     default:
//       // TODO
//       break;
//   }

//   return path;
// }
