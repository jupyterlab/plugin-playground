import { JupyterFrontEnd } from '@jupyterlab/application';

import {
  CompletionHandler,
  ICompletionContext,
  ICompletionProvider
} from '@jupyterlab/completer';

export interface ICommandRecord {
  id: string;
  label: string;
  caption: string;
}

interface ICommandQuery {
  searchText: string;
  replaceStart: number;
  replaceEnd: number;
  insertText: (commandId: string) => string;
}

export const COMMAND_COMPLETION_PROVIDER_ID =
  'CompletionProvider:plugin-playground-commands';
export const COMMAND_COMPLETION_PROVIDER_RANK = 1200;

const SUPPORTED_MIME_PATTERN = /(typescript|javascript|jsx|tsx)/i;
const INTERNAL_COMMAND_PREFIX = '__internal:';

export class CommandCompletionProvider implements ICompletionProvider {
  constructor(app: JupyterFrontEnd) {
    this._app = app;
  }

  readonly identifier = COMMAND_COMPLETION_PROVIDER_ID;
  readonly rank = COMMAND_COMPLETION_PROVIDER_RANK;
  readonly renderer = null;

  async isApplicable(context: ICompletionContext): Promise<boolean> {
    return (
      !!context.editor &&
      SUPPORTED_MIME_PATTERN.test(context.editor.model.mimeType)
    );
  }

  async fetch(
    request: CompletionHandler.IRequest,
    _context: ICompletionContext
  ): Promise<CompletionHandler.ICompletionItemsReply> {
    const query = Private.extractCommandQuery(request.text, request.offset);

    if (!query) {
      return {
        start: request.offset,
        end: request.offset,
        items: []
      };
    }

    const searchText = query.searchText.toLowerCase();
    const items = getCommandRecords(this._app)
      .filter(record => Private.matchesSearch(record, searchText))
      .map(record => {
        const insertText = query.insertText(record.id);
        const details = formatCommandDescription(record);

        return {
          label: insertText,
          insertText,
          type: 'command',
          documentation: details || undefined
        };
      });

    return {
      start: query.replaceStart,
      end: query.replaceEnd,
      items
    };
  }

  private readonly _app: JupyterFrontEnd;
}

export function getCommandRecords(
  app: Pick<JupyterFrontEnd, 'commands'>
): Array<ICommandRecord> {
  return app.commands
    .listCommands()
    .filter(id => !Private.isHiddenCommand(id))
    .map(id => ({
      id,
      label: Private.safeCommandText(() => app.commands.label(id)),
      caption: Private.safeCommandText(() => app.commands.caption(id))
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function formatCommandDescription(record: ICommandRecord): string {
  return [record.label, record.caption]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' | ');
}

namespace Private {
  const COMMAND_METHODS = [
    'execute',
    'isEnabled',
    'isVisible',
    'isToggled',
    'hasCommand',
    'label',
    'caption',
    'usage',
    'className',
    'dataset',
    'describedBy',
    'iconClass',
    'iconLabel',
    'mnemonic',
    'notifyCommandChanged'
  ].join('|');

  const QUOTED_EXECUTE_PATTERN = new RegExp(
    `(?:^|[^\\w$.])(?:app\\.)?commands\\.(?:${COMMAND_METHODS})\\(\\s*(['"])([^'"\\\\]*)$`,
    's'
  );

  const BARE_EXECUTE_PATTERN = new RegExp(
    `(?:^|[^\\w$.])(?:app\\.)?commands\\.(?:${COMMAND_METHODS})\\(\\s*([A-Za-z0-9:._-]*)$`,
    's'
  );

  export function extractCommandQuery(
    source: string,
    offset: number
  ): ICommandQuery | null {
    const beforeCursor = source.slice(0, offset);
    const afterCursor = source.slice(offset);
    const quotedMatch = beforeCursor.match(QUOTED_EXECUTE_PATTERN);

    if (quotedMatch) {
      const quote = quotedMatch[1];
      const prefix = quotedMatch[2];
      const suffix = quotedStringSuffix(afterCursor, quote);

      return {
        searchText: `${prefix}${suffix}`,
        replaceStart: offset - prefix.length,
        replaceEnd: offset + suffix.length,
        insertText: commandId => commandId
      };
    }

    const bareMatch = beforeCursor.match(BARE_EXECUTE_PATTERN);

    if (!bareMatch) {
      return null;
    }

    const fragment = bareMatch[1];

    return {
      searchText: fragment,
      replaceStart: offset - fragment.length,
      replaceEnd: offset,
      insertText: commandId => `'${commandId}'`
    };
  }

  export function matchesSearch(
    record: ICommandRecord,
    searchText: string
  ): boolean {
    if (!searchText) {
      return true;
    }

    return [record.id, record.label, record.caption].some(value =>
      value.toLowerCase().includes(searchText)
    );
  }

  export function safeCommandText(getValue: () => string): string {
    try {
      return getValue().trim();
    } catch {
      return '';
    }
  }

  export function isHiddenCommand(id: string): boolean {
    return id.startsWith(INTERNAL_COMMAND_PREFIX);
  }

  function quotedStringSuffix(afterCursor: string, quote: string): string {
    const pattern = quote === "'" ? /^[^'\\\r\n]*/ : /^[^"\\\r\n]*/;

    return afterCursor.match(pattern)?.[0] ?? '';
  }
}
