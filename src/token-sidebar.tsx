import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';

import {
  addIcon,
  caretDownEmptyIcon,
  checkIcon,
  copyIcon,
  jsonIcon,
  MenuSvg,
  offlineBoltIcon,
  type LabIcon
} from '@jupyterlab/ui-components';

import * as React from 'react';
import { CommandRegistry } from '@lumino/commands';
import type { IKnownModule } from './known-modules';
import {
  type ICommandArgumentDocumentation,
  formatCommandDescription,
  type ICommandRecord
} from './command-completion';
import { ContentUtils } from './contents';
import {
  docsLinkIcon,
  gitRepositoryIcon,
  githubRepositoryIcon,
  npmPackageIcon,
  schemaNumberIcon
} from './icons';

export type CommandInsertMode = 'insert' | 'ai';

export namespace TokenSidebar {
  export interface ITokenRecord {
    name: string;
    description: string;
  }

  export interface IOptions {
    getTokens: () => ReadonlyArray<ITokenRecord>;
    getCommands: () => ReadonlyArray<ICommandRecord>;
    getKnownModules: () => ReadonlyArray<IKnownModule>;
    getCommandArguments: (
      commandId: string
    ) => Promise<ICommandArgumentDocumentation | null>;
    getCommandArgumentCount: (commandId: string) => Promise<number | null>;
    discoverKnownModules: (force: boolean) => Promise<void>;
    openDocumentationLink: (
      url: string,
      moduleName: string,
      openInBrowserTab: boolean
    ) => void;
    onInsertImport: (tokenName: string) => Promise<void> | void;
    isImportEnabled: (tokenName: string) => boolean;
    onSetCommandInsertMode: (mode: CommandInsertMode) => Promise<void> | void;
    onInsertCommand: (
      commandId: string,
      mode: CommandInsertMode
    ) => Promise<void> | void;
    getCommandInsertMode: () => CommandInsertMode;
    isCommandInsertEnabled: () => boolean;
  }
}

type ExtensionPointView = 'tokens' | 'commands' | 'packages';

interface IKnownModuleLink {
  kind: 'docs' | 'external';
  label: string;
  title: string;
  ariaLabel: string;
  icon: LabIcon;
  url: string;
}
const EXTENSION_POINT_PANEL_ID = 'jp-PluginPlayground-extensionPointPanel';
const COMMAND_INSERT_MENU_INSERT_ID =
  'plugin-playground:command-insert-selection';
const COMMAND_INSERT_MENU_AI_ID = 'plugin-playground:command-insert-ai';
const TOUR_FIRST_TOKEN_ACTIONS_ID = 'jp-PluginPlayground-tour-token-actions';
const TOUR_FIRST_TOKEN_INSERT_BUTTON_ID =
  'jp-PluginPlayground-tour-token-insert';
const TOUR_FIRST_TOKEN_COPY_BUTTON_ID = 'jp-PluginPlayground-tour-token-copy';
const TOUR_FIRST_COMMAND_INSERT_GROUP_ID =
  'jp-PluginPlayground-tour-command-insert-group';
const TOUR_FIRST_COMMAND_SCHEMA_COPY_ACTIONS_ID =
  'jp-PluginPlayground-tour-command-schema-copy-actions';
const TOUR_FIRST_COMMAND_SCHEMA_BUTTON_ID =
  'jp-PluginPlayground-tour-command-schema';
const TOUR_FIRST_COMMAND_COPY_BUTTON_ID =
  'jp-PluginPlayground-tour-command-copy';
const TOUR_FIRST_PACKAGE_ACTIONS_ID =
  'jp-PluginPlayground-tour-package-actions';

export function filterTokenRecords(
  tokens: ReadonlyArray<TokenSidebar.ITokenRecord>,
  query: string
): ReadonlyArray<TokenSidebar.ITokenRecord> {
  const normalizedQuery = ContentUtils.normalizeQuery(query);
  if (!normalizedQuery) {
    return tokens;
  }
  return tokens.filter(
    token =>
      token.name.toLowerCase().includes(normalizedQuery) ||
      token.description.toLowerCase().includes(normalizedQuery)
  );
}

export function filterCommandRecords(
  commands: ReadonlyArray<ICommandRecord>,
  query: string
): ReadonlyArray<ICommandRecord> {
  const normalizedQuery = ContentUtils.normalizeQuery(query);
  if (!normalizedQuery) {
    return commands;
  }
  return commands.filter(
    command =>
      command.id.toLowerCase().includes(normalizedQuery) ||
      command.label.toLowerCase().includes(normalizedQuery) ||
      command.caption.toLowerCase().includes(normalizedQuery)
  );
}

export class TokenSidebar extends ReactWidget {
  private readonly _getTokens: () => ReadonlyArray<TokenSidebar.ITokenRecord>;
  private readonly _getCommands: () => ReadonlyArray<ICommandRecord>;
  private readonly _getKnownModules: () => ReadonlyArray<IKnownModule>;
  private readonly _getCommandArguments: (
    commandId: string
  ) => Promise<ICommandArgumentDocumentation | null>;
  private readonly _getCommandArgumentCount: (
    commandId: string
  ) => Promise<number | null>;
  private readonly _discoverKnownModulesFn: (force: boolean) => Promise<void>;
  private readonly _openDocumentationLink: (
    url: string,
    moduleName: string,
    openInBrowserTab: boolean
  ) => void;
  private readonly _onInsertImport: (tokenName: string) => Promise<void> | void;
  private readonly _isImportEnabled: (tokenName: string) => boolean;
  private readonly _onSetCommandInsertMode: (
    mode: CommandInsertMode
  ) => Promise<void> | void;
  private readonly _onInsertCommand: (
    commandId: string,
    mode: CommandInsertMode
  ) => Promise<void> | void;
  private readonly _getCommandInsertMode: () => CommandInsertMode;
  private readonly _isCommandInsertEnabled: () => boolean;
  private _query = '';
  private _activeView: ExtensionPointView = 'tokens';
  private _isDiscoveringKnownModules = false;
  private _knownModulesError = '';
  private _hasDiscoveredKnownModules = false;
  private _copiedValue: string | null = null;
  private _copiedTimer: number | null = null;
  private _expandedCommandIds = new Set<string>();
  private _loadingCommandIds = new Set<string>();
  private _commandArguments = new Map<
    string,
    ICommandArgumentDocumentation | null
  >();
  private _commandArgumentCounts = new Map<string, number | null>();
  private readonly _commandInsertMenuCommands = new CommandRegistry();
  private readonly _commandInsertMenu = new MenuSvg({
    commands: this._commandInsertMenuCommands
  });

  constructor(options: TokenSidebar.IOptions) {
    super();
    this._getTokens = options.getTokens;
    this._getCommands = options.getCommands;
    this._getKnownModules = options.getKnownModules;
    this._getCommandArguments = options.getCommandArguments;
    this._getCommandArgumentCount = options.getCommandArgumentCount;
    this._discoverKnownModulesFn = options.discoverKnownModules;
    this._openDocumentationLink = options.openDocumentationLink;
    this._onInsertImport = options.onInsertImport;
    this._isImportEnabled = options.isImportEnabled;
    this._onSetCommandInsertMode = options.onSetCommandInsertMode;
    this._onInsertCommand = options.onInsertCommand;
    this._getCommandInsertMode = options.getCommandInsertMode;
    this._isCommandInsertEnabled = options.isCommandInsertEnabled;
    this.addClass('jp-PluginPlayground-sidebar');
    this._commandInsertMenuCommands.addCommand(COMMAND_INSERT_MENU_INSERT_ID, {
      label: 'Insert in selection',
      describedBy: { args: null },
      isToggled: () => this._getCommandInsertMode() === 'insert',
      execute: () => {
        void this._setCommandInsertMode('insert');
      }
    });
    this._commandInsertMenuCommands.addCommand(COMMAND_INSERT_MENU_AI_ID, {
      label: 'Prompt AI to insert',
      describedBy: { args: null },
      isToggled: () => this._getCommandInsertMode() === 'ai',
      execute: () => {
        void this._setCommandInsertMode('ai');
      }
    });
  }

  public showPackagesView(): void {
    this._setActiveView('packages');
  }

  public showTokensView(): void {
    this._setActiveView('tokens');
  }

  public showCommandsView(): void {
    this._setActiveView('commands');
  }

  dispose(): void {
    if (this._copiedTimer !== null) {
      window.clearTimeout(this._copiedTimer);
      this._copiedTimer = null;
    }
    this._commandInsertMenu.dispose();
    super.dispose();
  }

  render(): JSX.Element {
    const isTokenView = this._activeView === 'tokens';
    const isCommandView = this._activeView === 'commands';
    const isPackagesView = this._activeView === 'packages';
    const commandInsertMode = this._getCommandInsertMode();
    const isAICommandInsertMode = commandInsertMode === 'ai';
    const canInsertCommand = this._isCommandInsertEnabled();
    const activeTabId = `jp-PluginPlayground-extensionPointTab-${this._activeView}`;
    const filterCountSummaryId = `${activeTabId}-filter-count-summary`;
    let tokens: ReadonlyArray<TokenSidebar.ITokenRecord> = [];
    let commands: ReadonlyArray<ICommandRecord> = [];
    let knownModules: ReadonlyArray<IKnownModule> = [];
    let filteredTokens: ReadonlyArray<TokenSidebar.ITokenRecord> = [];
    let filteredCommands: ReadonlyArray<ICommandRecord> = [];
    let filteredKnownModules: ReadonlyArray<IKnownModule> = [];

    if (isTokenView) {
      tokens = this._getTokens();
      filteredTokens = filterTokenRecords(tokens, this._query);
    } else if (isCommandView) {
      commands = this._getCommands();
      filteredCommands = filterCommandRecords(commands, this._query);
    } else {
      knownModules = this._getKnownModules();
      const normalizedQuery = ContentUtils.normalizeQuery(this._query);
      filteredKnownModules =
        normalizedQuery.length > 0
          ? knownModules.filter(known => {
              const haystack = [known.name, known.description, known.origin]
                .map(value => value ?? '')
                .join(' ')
                .toLowerCase();
              return haystack.includes(normalizedQuery);
            })
          : knownModules;
    }
    const itemCount = isTokenView
      ? filteredTokens.length
      : isCommandView
      ? filteredCommands.length
      : filteredKnownModules.length;
    const totalCount = isTokenView
      ? tokens.length
      : isCommandView
      ? commands.length
      : knownModules.length;
    const itemType = isTokenView
      ? 'token strings'
      : isCommandView
      ? 'commands'
      : 'packages';
    const countSummary = `${itemCount} of ${totalCount} ${itemType}`;
    const viewDescription = isTokenView
      ? 'Dependencies your plugin needs from other plugins.'
      : isCommandView
      ? 'Actions that JupyterLab can do that your plugin can trigger.'
      : 'External code libraries your plugin can import.';
    const filterPlaceholder = isTokenView
      ? 'Filter token strings'
      : isCommandView
      ? 'Filter command ids'
      : 'Filter package names';
    const filterAriaLabel = isTokenView
      ? 'Filter token strings'
      : isCommandView
      ? 'Filter command ids'
      : 'Filter packages';

    return (
      <div className="jp-PluginPlayground-sidebarInner">
        <div
          className="jp-PluginPlayground-viewToggle"
          role="tablist"
          aria-label="Extension points"
          aria-orientation="horizontal"
        >
          {this._renderViewButton('tokens', 'Tokens')}
          {this._renderViewButton('commands', 'Commands')}
          {this._renderViewButton('packages', 'Packages')}
        </div>
        <div
          id={EXTENSION_POINT_PANEL_ID}
          className="jp-PluginPlayground-viewPanel"
          role="tabpanel"
          aria-labelledby={activeTabId}
        >
          <div className="jp-PluginPlayground-filterRow">
            <input
              className="jp-PluginPlayground-filter"
              type="search"
              placeholder={filterPlaceholder}
              aria-label={filterAriaLabel}
              aria-describedby={filterCountSummaryId}
              title={countSummary}
              value={this._query}
              onChange={this._onQueryChange}
            />
            <span
              id={filterCountSummaryId}
              className="jp-PluginPlayground-visuallyHidden"
            >
              {countSummary}
            </span>
            <span
              className="jp-PluginPlayground-filterCount"
              aria-hidden="true"
            >
              {itemCount}/{totalCount}
            </span>
          </div>
          <p className="jp-PluginPlayground-viewDescription">
            {viewDescription}
          </p>
          {isPackagesView && this._isDiscoveringKnownModules ? (
            <p className="jp-PluginPlayground-count">
              Discovering federated extension packages…
            </p>
          ) : null}
          {isPackagesView && this._knownModulesError ? (
            <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleError">
              Failed to discover federated packages: {this._knownModulesError}
            </p>
          ) : null}
          {itemCount === 0 ? (
            <p className="jp-PluginPlayground-count">
              {isTokenView
                ? 'No matching token strings.'
                : isCommandView
                ? 'No matching commands.'
                : 'No matching packages.'}
            </p>
          ) : isTokenView ? (
            <ul className="jp-PluginPlayground-list">
              {filteredTokens.map((token, index) => (
                <li key={token.name} className="jp-PluginPlayground-listItem">
                  <div className="jp-PluginPlayground-row">
                    <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                      {token.name}
                    </code>
                    <div
                      className="jp-PluginPlayground-tokenActions"
                      id={index === 0 ? TOUR_FIRST_TOKEN_ACTIONS_ID : undefined}
                    >
                      <button
                        className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-importButton"
                        type="button"
                        id={
                          index === 0
                            ? TOUR_FIRST_TOKEN_INSERT_BUTTON_ID
                            : undefined
                        }
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
                        id={
                          index === 0
                            ? TOUR_FIRST_TOKEN_COPY_BUTTON_ID
                            : undefined
                        }
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
                    <p className="jp-PluginPlayground-description">
                      {token.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : isCommandView ? (
            <ul className="jp-PluginPlayground-list">
              {filteredCommands.map((command, index) => {
                this._ensureCommandArgumentCount(command.id);
                const description = formatCommandDescription(command);
                const isExpanded = this._expandedCommandIds.has(command.id);
                const isLoadingArguments = this._loadingCommandIds.has(
                  command.id
                );
                const commandArgumentCount = this._commandArgumentCounts.get(
                  command.id
                );
                const argumentCountBadge =
                  typeof commandArgumentCount === 'number'
                    ? commandArgumentCount.toString()
                    : '?';
                const commandArguments = this._commandArguments.get(command.id);
                const isUnknownArgumentCount = commandArgumentCount === null;
                const isArgumentsButtonDisabled =
                  !isExpanded && (isLoadingArguments || isUnknownArgumentCount);
                const commandArgumentsPanelId = this._commandArgumentsPanelId(
                  command.id
                );

                return (
                  <li key={command.id} className="jp-PluginPlayground-listItem">
                    <div className="jp-PluginPlayground-row">
                      <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                        {command.id}
                      </code>
                      <div className="jp-PluginPlayground-tokenActions">
                        <div
                          className="jp-PluginPlayground-commandInsertSplit"
                          id={
                            index === 0
                              ? TOUR_FIRST_COMMAND_INSERT_GROUP_ID
                              : undefined
                          }
                        >
                          <button
                            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-commandInsertButton"
                            type="button"
                            onMouseDown={event => {
                              event.preventDefault();
                            }}
                            onClick={() => {
                              void this._insertCommand(
                                command.id,
                                commandInsertMode
                              );
                            }}
                            disabled={!canInsertCommand}
                            aria-label={
                              isAICommandInsertMode
                                ? `Prompt AI to insert command execution for ${command.id} (default)`
                                : `Insert command execution for ${command.id} (default)`
                            }
                            title={
                              isAICommandInsertMode
                                ? 'Prompt AI to insert command execution (default)'
                                : 'Insert command execution (default)'
                            }
                          >
                            {React.createElement(addIcon.react, {
                              tag: 'span',
                              elementSize: 'normal',
                              className: 'jp-PluginPlayground-actionIcon'
                            })}
                            {isAICommandInsertMode
                              ? React.createElement(offlineBoltIcon.react, {
                                  tag: 'span',
                                  elementSize: 'small',
                                  className:
                                    'jp-PluginPlayground-commandInsertAIMarkerIcon'
                                })
                              : null}
                          </button>
                          <button
                            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-commandInsertMenuButton jp-PluginPlayground-commandInsertDropdownButton"
                            type="button"
                            onMouseDown={event => {
                              event.preventDefault();
                            }}
                            onClick={event => {
                              this._openCommandInsertMenu(event.currentTarget);
                            }}
                            disabled={!canInsertCommand}
                            aria-haspopup="menu"
                            aria-label={`Choose command insertion mode for ${command.id}`}
                            title="Choose command insertion mode"
                          >
                            {React.createElement(caretDownEmptyIcon.react, {
                              tag: 'span',
                              elementSize: 'normal',
                              className: 'jp-PluginPlayground-actionIcon'
                            })}
                          </button>
                        </div>
                        <div
                          className="jp-PluginPlayground-commandSchemaCopyActions"
                          id={
                            index === 0
                              ? TOUR_FIRST_COMMAND_SCHEMA_COPY_ACTIONS_ID
                              : undefined
                          }
                        >
                          <button
                            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-argumentBadgeButton"
                            type="button"
                            id={
                              index === 0
                                ? TOUR_FIRST_COMMAND_SCHEMA_BUTTON_ID
                                : undefined
                            }
                            onClick={() => {
                              void this._toggleCommandArguments(command.id);
                            }}
                            disabled={isArgumentsButtonDisabled}
                            aria-expanded={isExpanded}
                            aria-controls={commandArgumentsPanelId}
                            aria-label={
                              isArgumentsButtonDisabled
                                ? `Argument documentation unavailable for ${command.id}`
                                : isExpanded
                                ? `Hide argument documentation for ${command.id}`
                                : `Show argument documentation for ${command.id}`
                            }
                            title={
                              isArgumentsButtonDisabled
                                ? 'Argument documentation unavailable'
                                : isExpanded
                                ? 'Hide argument documentation'
                                : 'Show argument documentation'
                            }
                          >
                            <span
                              className="jp-PluginPlayground-argumentSchemaIcon"
                              aria-hidden="true"
                            >
                              {React.createElement(schemaNumberIcon.react, {
                                tag: 'span',
                                elementSize: 'normal',
                                className:
                                  'jp-PluginPlayground-actionIcon jp-PluginPlayground-argumentSchemaBaseIcon'
                              })}
                              <span className="jp-PluginPlayground-argumentSchemaCount">
                                {argumentCountBadge}
                              </span>
                            </span>
                          </button>
                          <button
                            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-copyButton"
                            type="button"
                            id={
                              index === 0
                                ? TOUR_FIRST_COMMAND_COPY_BUTTON_ID
                                : undefined
                            }
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
                    </div>
                    {description ? (
                      <p className="jp-PluginPlayground-description">
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
                          <p className="jp-PluginPlayground-count">
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
          ) : (
            <ul className="jp-PluginPlayground-list">
              {filteredKnownModules.map((known, index) => {
                const links = this._knownModuleLinks(known);
                const description = this._knownModuleDescription(known);
                return (
                  <li key={known.name} className="jp-PluginPlayground-listItem">
                    <div className="jp-PluginPlayground-row">
                      <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString jp-PluginPlayground-packageName">
                        {known.name.split('/').map((part, index) => (
                          <React.Fragment key={`${known.name}:${index}`}>
                            {index > 0 ? (
                              <>
                                /<wbr />
                              </>
                            ) : null}
                            {part}
                          </React.Fragment>
                        ))}
                      </code>
                      <div
                        className="jp-PluginPlayground-tokenActions jp-PluginPlayground-packageActions"
                        id={
                          index === 0
                            ? TOUR_FIRST_PACKAGE_ACTIONS_ID
                            : undefined
                        }
                      >
                        {links.map(link => (
                          <button
                            key={`${known.name}:${link.label}`}
                            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton"
                            type="button"
                            onClick={event => {
                              if (link.kind === 'docs') {
                                this._openDocumentationLink(
                                  link.url,
                                  known.name,
                                  event.shiftKey
                                );
                                return;
                              }
                              ContentUtils.openExternalLink(link.url);
                            }}
                            aria-label={`${link.ariaLabel} for ${known.name}`}
                            title={link.title}
                          >
                            {React.createElement(link.icon.react, {
                              tag: 'span',
                              elementSize: 'normal',
                              className: 'jp-PluginPlayground-actionIcon'
                            })}
                            <span className="jp-PluginPlayground-actionLabel">
                              {link.label}
                            </span>
                          </button>
                        ))}
                        <button
                          className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-copyButton"
                          type="button"
                          onClick={() => {
                            void this._copyValue(known.name, 'package name');
                          }}
                          aria-label={
                            this._copiedValue === known.name
                              ? `Copied package name ${known.name}`
                              : `Copy package name ${known.name}`
                          }
                          title={
                            this._copiedValue === known.name
                              ? 'Copied'
                              : 'Copy package name'
                          }
                        >
                          {React.createElement(
                            this._copiedValue === known.name
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
                      <p className="jp-PluginPlayground-description">
                        {description}
                      </p>
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

    if (view === 'packages') {
      void this._discoverKnownModules(false);
    }
  }

  private async _discoverKnownModules(force: boolean): Promise<void> {
    if (!force && this._hasDiscoveredKnownModules) {
      return;
    }
    if (this._isDiscoveringKnownModules) {
      return;
    }

    this._isDiscoveringKnownModules = true;
    this._knownModulesError = '';
    this.update();

    try {
      await this._discoverKnownModulesFn(force);
      this._hasDiscoveredKnownModules = true;
    } catch (error) {
      this._knownModulesError =
        error instanceof Error ? error.message : 'Unknown discovery error';
    } finally {
      this._isDiscoveringKnownModules = false;
      this.update();
    }
  }

  private _knownModuleDescription(known: IKnownModule): string {
    const pieces: string[] = [];
    const description = known.description?.trim();
    const origin = known.origin?.trim();

    if (description) {
      pieces.push(description);
    }
    if (origin) {
      pieces.push(`Origin: ${origin}`);
    }

    return pieces.join(' ');
  }

  private _knownModuleLinks(known: IKnownModule): IKnownModuleLink[] {
    const repositoryUrl = (known.urls?.repositoryHtml ?? '').toLowerCase();
    const isGithubRepository = repositoryUrl.includes('github.com');
    const repositoryIcon = isGithubRepository
      ? githubRepositoryIcon
      : gitRepositoryIcon;
    const repositoryLabel = isGithubRepository ? 'GitHub' : 'Repo';
    const links: Array<Omit<IKnownModuleLink, 'url'> & { url?: string }> = [
      {
        kind: 'docs',
        label: 'Docs',
        title: 'Open documentation',
        ariaLabel: 'Open docs',
        icon: docsLinkIcon,
        url: known.urls?.docHtml
      },
      {
        kind: 'external',
        label: 'npm',
        title: 'Open npm package page',
        ariaLabel: 'Open npm package',
        icon: npmPackageIcon,
        url: known.urls?.npmHtml
      },
      {
        kind: 'external',
        label: repositoryLabel,
        title: isGithubRepository
          ? 'Open GitHub repository'
          : 'Open repository',
        ariaLabel: isGithubRepository
          ? 'Open GitHub repository'
          : 'Open repository',
        icon: repositoryIcon,
        url: known.urls?.repositoryHtml
      },
      {
        kind: 'external',
        label: 'package.json',
        title: 'Open package.json',
        ariaLabel: 'Open package.json',
        icon: jsonIcon,
        url: known.urls?.packageJson
      }
    ];

    const seenUrls = new Set<string>();
    return links
      .map(link => {
        const trimmedUrl = (link.url ?? '').trim();
        if (!trimmedUrl) {
          return null;
        }
        if (seenUrls.has(trimmedUrl)) {
          return null;
        }
        seenUrls.add(trimmedUrl);
        return { ...link, url: trimmedUrl } as IKnownModuleLink;
      })
      .filter((link): link is IKnownModuleLink => link !== null);
  }

  private _ensureCommandArgumentCount(commandId: string): void {
    if (this._commandArgumentCounts.has(commandId)) {
      return;
    }

    this._commandArgumentCounts.set(commandId, null);
    void this._getCommandArgumentCount(commandId)
      .then(argumentCount => {
        this._commandArgumentCounts.set(commandId, argumentCount);
      })
      .catch(() => {
        this._commandArgumentCounts.set(commandId, null);
      })
      .finally(() => {
        this.update();
      });
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

  private _openCommandInsertMenu(anchorButton: HTMLButtonElement): void {
    this._commandInsertMenu.clearItems();
    this._commandInsertMenu.addItem({
      command: COMMAND_INSERT_MENU_INSERT_ID
    });
    this._commandInsertMenu.addItem({
      command: COMMAND_INSERT_MENU_AI_ID
    });
    const anchorRect = anchorButton.getBoundingClientRect();
    const splitRect = anchorButton.parentElement?.getBoundingClientRect();
    this._commandInsertMenu.open(
      splitRect?.left ?? anchorRect.left,
      anchorRect.bottom
    );
  }

  private async _setCommandInsertMode(mode: CommandInsertMode): Promise<void> {
    try {
      await this._onSetCommandInsertMode(mode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown mode switch error';
      await showDialog({
        title: 'Failed to change command insertion mode',
        body: `Could not switch to "${mode}" mode. ${message}`,
        buttons: [Dialog.okButton()]
      });
    }
  }

  private async _insertCommand(
    commandId: string,
    mode: CommandInsertMode
  ): Promise<void> {
    try {
      await this._onInsertCommand(commandId, mode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown insertion error';
      await showDialog({
        title:
          mode === 'ai'
            ? 'Failed to open AI command insertion prompt'
            : 'Failed to insert command execution',
        body:
          mode === 'ai'
            ? `Could not prompt AI to insert command "${commandId}". ${message}`
            : `Could not insert command "${commandId}". ${message}`,
        buttons: [Dialog.okButton()]
      });
    }
  }

  private async _copyValue(value: string, valueKind: string): Promise<void> {
    try {
      await ContentUtils.copyValueToClipboard(value);
      ContentUtils.setCopiedStateWithTimeout(
        value,
        this._copiedTimer,
        timer => {
          this._copiedTimer = timer;
        },
        copiedValue => {
          this._copiedValue = copiedValue;
        },
        () => {
          this.update();
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown clipboard error';
      await showDialog({
        title: `Failed to copy ${valueKind}`,
        body: `Could not copy "${value}". ${message}`,
        buttons: [Dialog.okButton()]
      });
    }
  }
}
