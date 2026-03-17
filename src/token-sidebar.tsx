import {
  Clipboard,
  Dialog,
  ReactWidget,
  showDialog
} from '@jupyterlab/apputils';

import {
  addIcon,
  infoIcon,
  checkIcon,
  copyIcon
} from '@jupyterlab/ui-components';

import * as React from 'react';

import {
  type ICommandArgumentDocumentation,
  formatCommandDescription,
  type ICommandRecord
} from './command-completion';

export namespace TokenSidebar {
  export interface ITokenRecord {
    name: string;
    description: string;
  }

  export interface IOptions {
    getTokens: () => ReadonlyArray<ITokenRecord>;
    getCommands: () => ReadonlyArray<ICommandRecord>;
    getCommandArguments: (
      commandId: string
    ) => Promise<ICommandArgumentDocumentation | null>;
    onInsertImport: (tokenName: string) => Promise<void> | void;
    isImportEnabled: (tokenName: string) => boolean;
  }
}

type ExtensionPointView = 'tokens' | 'commands';
const EXTENSION_POINT_PANEL_ID = 'jp-PluginPlayground-extensionPointPanel';

export class TokenSidebar extends ReactWidget {
  private readonly _getTokens: () => ReadonlyArray<TokenSidebar.ITokenRecord>;
  private readonly _getCommands: () => ReadonlyArray<ICommandRecord>;
  private readonly _getCommandArguments: (
    commandId: string
  ) => Promise<ICommandArgumentDocumentation | null>;
  private readonly _onInsertImport: (tokenName: string) => Promise<void> | void;
  private readonly _isImportEnabled: (tokenName: string) => boolean;
  private _query = '';
  private _activeView: ExtensionPointView = 'tokens';
  private _copiedValue: string | null = null;
  private _copiedTimer: number | null = null;
  private _expandedCommandIds = new Set<string>();
  private _loadingCommandIds = new Set<string>();
  private _commandArguments = new Map<
    string,
    ICommandArgumentDocumentation | null
  >();

  constructor(options: TokenSidebar.IOptions) {
    super();
    this._getTokens = options.getTokens;
    this._getCommands = options.getCommands;
    this._getCommandArguments = options.getCommandArguments;
    this._onInsertImport = options.onInsertImport;
    this._isImportEnabled = options.isImportEnabled;
    this.addClass('jp-PluginPlayground-sidebar');
    this.addClass('jp-PluginPlayground-tokenSidebar');
  }

  dispose(): void {
    if (this._copiedTimer !== null) {
      window.clearTimeout(this._copiedTimer);
      this._copiedTimer = null;
    }
    super.dispose();
  }

  render(): JSX.Element {
    const query = this._query.trim().toLowerCase();
    const isTokenView = this._activeView === 'tokens';
    const activeTabId = `jp-PluginPlayground-extensionPointTab-${this._activeView}`;
    let tokens: ReadonlyArray<TokenSidebar.ITokenRecord> = [];
    let commands: ReadonlyArray<ICommandRecord> = [];
    let filteredTokens: ReadonlyArray<TokenSidebar.ITokenRecord> = [];
    let filteredCommands: ReadonlyArray<ICommandRecord> = [];

    if (isTokenView) {
      tokens = this._getTokens();
      filteredTokens =
        query.length > 0
          ? tokens.filter(
              token =>
                token.name.toLowerCase().includes(query) ||
                token.description.toLowerCase().includes(query)
            )
          : tokens;
    } else {
      commands = this._getCommands();
      filteredCommands =
        query.length > 0
          ? commands.filter(
              command =>
                command.id.toLowerCase().includes(query) ||
                command.label.toLowerCase().includes(query) ||
                command.caption.toLowerCase().includes(query)
            )
          : commands;
    }

    const itemCount = isTokenView
      ? filteredTokens.length
      : filteredCommands.length;
    const totalCount = isTokenView ? tokens.length : commands.length;

    return (
      <div className="jp-PluginPlayground-sidebarInner jp-PluginPlayground-tokenSidebarInner">
        <div
          className="jp-PluginPlayground-viewToggle"
          role="tablist"
          aria-label="Extension points"
          aria-orientation="horizontal"
        >
          {this._renderViewButton('tokens', 'Tokens')}
          {this._renderViewButton('commands', 'Commands')}
        </div>
        <div
          id={EXTENSION_POINT_PANEL_ID}
          className="jp-PluginPlayground-viewPanel"
          role="tabpanel"
          aria-labelledby={activeTabId}
        >
          <input
            className="jp-PluginPlayground-filter jp-PluginPlayground-tokenFilter"
            type="search"
            placeholder={
              isTokenView ? 'Filter token strings' : 'Filter command ids'
            }
            value={this._query}
            onChange={this._onQueryChange}
          />
          <p className="jp-PluginPlayground-count jp-PluginPlayground-tokenCount">
            {itemCount} of {totalCount}{' '}
            {isTokenView ? 'token strings' : 'commands'}
          </p>
          {itemCount === 0 ? (
            <p className="jp-PluginPlayground-count jp-PluginPlayground-tokenCount">
              {isTokenView
                ? 'No matching token strings.'
                : 'No matching commands.'}
            </p>
          ) : isTokenView ? (
            <ul className="jp-PluginPlayground-list jp-PluginPlayground-tokenList">
              {filteredTokens.map(token => (
                <li
                  key={token.name}
                  className="jp-PluginPlayground-listItem jp-PluginPlayground-tokenListItem"
                >
                  <div className="jp-PluginPlayground-row jp-PluginPlayground-tokenRow">
                    <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                      {token.name}
                    </code>
                    <div className="jp-PluginPlayground-tokenActions">
                      <button
                        className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-importButton"
                        type="button"
                        onClick={() => {
                          void this._insertImport(token.name);
                        }}
                        disabled={!this._isImportEnabled(token.name)}
                        aria-label={`Insert import statement for ${token.name}`}
                        title="Insert import statement"
                      >
                        {React.createElement(addIcon.react, {
                          tag: 'span',
                          elementSize: 'normal',
                          className: 'jp-PluginPlayground-actionIcon'
                        })}
                      </button>
                      <button
                        className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-copyButton"
                        type="button"
                        onClick={() => {
                          void this._copyValue(token.name, 'token string');
                        }}
                        aria-label={
                          this._copiedValue === token.name
                            ? `Copied token string ${token.name}`
                            : `Copy token string ${token.name}`
                        }
                        title={
                          this._copiedValue === token.name
                            ? 'Copied'
                            : 'Copy token string'
                        }
                      >
                        {React.createElement(
                          this._copiedValue === token.name
                            ? checkIcon.react
                            : copyIcon.react,
                          {
                            tag: 'span',
                            elementSize: 'normal',
                            className: 'jp-PluginPlayground-actionIcon'
                          }
                        )}
                      </button>
                    </div>
                  </div>
                  {token.description ? (
                    <p className="jp-PluginPlayground-description jp-PluginPlayground-tokenDescription">
                      {token.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="jp-PluginPlayground-list jp-PluginPlayground-tokenList">
              {filteredCommands.map(command => {
                const description = formatCommandDescription(command);
                const isExpanded = this._expandedCommandIds.has(command.id);
                const isLoadingArguments = this._loadingCommandIds.has(
                  command.id
                );
                const commandArguments = this._commandArguments.get(command.id);
                const hasNoArguments =
                  commandArguments === null &&
                  this._commandArguments.has(command.id);
                const isArgumentsButtonDisabled =
                  isLoadingArguments || (hasNoArguments && !isExpanded);
                const commandArgumentsPanelId = this._commandArgumentsPanelId(
                  command.id
                );

                return (
                  <li
                    key={command.id}
                    className="jp-PluginPlayground-listItem jp-PluginPlayground-tokenListItem"
                  >
                    <div className="jp-PluginPlayground-row jp-PluginPlayground-tokenRow">
                      <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                        {command.id}
                      </code>
                      <div className="jp-PluginPlayground-tokenActions">
                        <button
                          className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton"
                          type="button"
                          onClick={() => {
                            void this._toggleCommandArguments(command.id);
                          }}
                          disabled={isArgumentsButtonDisabled}
                          aria-expanded={isExpanded}
                          aria-controls={commandArgumentsPanelId}
                          aria-label={
                            isArgumentsButtonDisabled
                              ? `No arguments for ${command.id}`
                              : isExpanded
                              ? `Hide argument documentation for ${command.id}`
                              : `Show argument documentation for ${command.id}`
                          }
                          title={
                            isArgumentsButtonDisabled
                              ? 'No arguments'
                              : isExpanded
                              ? 'Hide argument documentation'
                              : 'Show argument documentation'
                          }
                        >
                          {React.createElement(infoIcon.react, {
                            tag: 'span',
                            elementSize: 'normal',
                            className: 'jp-PluginPlayground-actionIcon'
                          })}
                        </button>
                        <button
                          className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-copyButton"
                          type="button"
                          onClick={() => {
                            void this._copyValue(command.id, 'command id');
                          }}
                          aria-label={
                            this._copiedValue === command.id
                              ? `Copied command id ${command.id}`
                              : `Copy command id ${command.id}`
                          }
                          title={
                            this._copiedValue === command.id
                              ? 'Copied'
                              : 'Copy command id'
                          }
                        >
                          {React.createElement(
                            this._copiedValue === command.id
                              ? checkIcon.react
                              : copyIcon.react,
                            {
                              tag: 'span',
                              elementSize: 'normal',
                              className: 'jp-PluginPlayground-actionIcon'
                            }
                          )}
                        </button>
                      </div>
                    </div>
                    {description ? (
                      <p className="jp-PluginPlayground-description jp-PluginPlayground-tokenDescription">
                        {description}
                      </p>
                    ) : null}
                    {isExpanded ? (
                      <div
                        id={commandArgumentsPanelId}
                        className="jp-PluginPlayground-commandArguments"
                        role="region"
                        aria-label={`Arguments for ${command.id}`}
                      >
                        {isLoadingArguments ? (
                          <p className="jp-PluginPlayground-count jp-PluginPlayground-tokenCount">
                            Loading argument documentation…
                          </p>
                        ) : (
                          <pre className="jp-PluginPlayground-commandArgumentsText">
                            {this._formatCommandArguments(commandArguments)}
                          </pre>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  private _onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this._query = event.currentTarget.value;
    this.update();
  };

  private _renderViewButton(
    view: ExtensionPointView,
    label: string
  ): JSX.Element {
    const isActive = this._activeView === view;

    return (
      <button
        className={`jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-viewButton${
          isActive ? ' jp-mod-active' : ''
        }`}
        id={`jp-PluginPlayground-extensionPointTab-${view}`}
        type="button"
        onClick={() => {
          this._setActiveView(view);
        }}
        role="tab"
        aria-selected={isActive}
        aria-controls={EXTENSION_POINT_PANEL_ID}
      >
        {label}
      </button>
    );
  }

  private _setActiveView(view: ExtensionPointView): void {
    if (this._activeView === view) {
      return;
    }

    this._activeView = view;
    this._query = '';
    this.update();
  }

  private async _toggleCommandArguments(commandId: string): Promise<void> {
    if (this._expandedCommandIds.has(commandId)) {
      this._expandedCommandIds.delete(commandId);
      this.update();
      return;
    }

    this._expandedCommandIds.add(commandId);
    if (this._commandArguments.has(commandId)) {
      this.update();
      return;
    }

    this._loadingCommandIds.add(commandId);
    this.update();

    try {
      const argumentsDocumentation = await this._getCommandArguments(commandId);
      this._commandArguments.set(commandId, argumentsDocumentation);
    } catch {
      this._commandArguments.set(commandId, null);
    } finally {
      this._loadingCommandIds.delete(commandId);
      this.update();
    }
  }

  private _formatCommandArguments(
    commandArguments: ICommandArgumentDocumentation | null | undefined
  ): string {
    if (!commandArguments) {
      return 'No arguments';
    }

    const sections: string[] = [];

    if (commandArguments.usage) {
      sections.push(`Usage:\n${commandArguments.usage}`);
    }

    if (commandArguments.args) {
      sections.push(
        `Arguments Schema:\n${JSON.stringify(commandArguments.args, null, 2)}`
      );
    }

    return sections.join('\n\n') || 'No arguments';
  }

  private _commandArgumentsPanelId(commandId: string): string {
    const normalizedId = commandId.replace(/[^A-Za-z0-9_-]/g, '-');
    return `jp-PluginPlayground-commandArguments-${normalizedId}`;
  }

  private async _insertImport(tokenName: string): Promise<void> {
    try {
      await this._onInsertImport(tokenName);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown insertion error';
      await showDialog({
        title: 'Failed to insert import statement',
        body: `Could not insert import for "${tokenName}". ${message}`,
        buttons: [Dialog.okButton()]
      });
    }
  }

  private async _copyValue(value: string, valueKind: string): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        Clipboard.copyToSystem(value);
      }
      this._setCopiedState(value);
    } catch (error) {
      try {
        Clipboard.copyToSystem(value);
        this._setCopiedState(value);
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
            ? error.message
            : 'Unknown clipboard error';
        await showDialog({
          title: `Failed to copy ${valueKind}`,
          body: `Could not copy "${value}". ${message}`,
          buttons: [Dialog.okButton()]
        });
      }
    }
  }

  private _setCopiedState(value: string): void {
    this._copiedValue = value;
    this.update();

    if (this._copiedTimer !== null) {
      window.clearTimeout(this._copiedTimer);
    }
    this._copiedTimer = window.setTimeout(() => {
      this._copiedValue = null;
      this._copiedTimer = null;
      this.update();
    }, 1200);
  }
}
