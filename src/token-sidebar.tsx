import {
  Clipboard,
  Dialog,
  ReactWidget,
  showDialog
} from '@jupyterlab/apputils';

import { addIcon, checkIcon, copyIcon } from '@jupyterlab/ui-components';

import * as React from 'react';

export namespace TokenSidebar {
  export interface ITokenRecord {
    name: string;
    description: string;
  }

  export interface IOptions {
    tokens: ReadonlyArray<ITokenRecord>;
    onInsertImport: (tokenName: string) => Promise<void> | void;
    isImportEnabled: () => boolean;
  }
}

export class TokenSidebar extends ReactWidget {
  private readonly _tokens: ReadonlyArray<TokenSidebar.ITokenRecord>;
  private readonly _onInsertImport: (tokenName: string) => Promise<void> | void;
  private readonly _isImportEnabled: () => boolean;
  private _query = '';
  private _copiedTokenName: string | null = null;
  private _copiedTimer: number | null = null;

  constructor(options: TokenSidebar.IOptions) {
    super();
    this._tokens = options.tokens;
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
    const filteredTokens =
      query.length > 0
        ? this._tokens.filter(
            token =>
              token.name.toLowerCase().includes(query) ||
              token.description.toLowerCase().includes(query)
          )
        : this._tokens;

    return (
      <div className="jp-PluginPlayground-sidebarInner jp-PluginPlayground-tokenSidebarInner">
        <input
          className="jp-PluginPlayground-filter jp-PluginPlayground-tokenFilter"
          type="search"
          placeholder="Filter token strings"
          value={this._query}
          onChange={this._onQueryChange}
        />
        <p className="jp-PluginPlayground-count jp-PluginPlayground-tokenCount">
          {filteredTokens.length} of {this._tokens.length} token strings
        </p>
        {filteredTokens.length === 0 ? (
          <p className="jp-PluginPlayground-count jp-PluginPlayground-tokenCount">
            No matching token strings.
          </p>
        ) : (
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
                  <div className="jp-PluginPlayground-actions">
                    <button
                      className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-importButton"
                      type="button"
                      onClick={() => {
                        void this._insertImport(token.name);
                      }}
                      disabled={!this._canInsertImport(token.name)}
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
                        void this._copyTokenName(token.name);
                      }}
                      aria-label={
                        this._copiedTokenName === token.name
                          ? `Copied token string ${token.name}`
                          : `Copy token string ${token.name}`
                      }
                      title={
                        this._copiedTokenName === token.name
                          ? 'Copied'
                          : 'Copy token string'
                      }
                    >
                      {React.createElement(
                        this._copiedTokenName === token.name
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
        )}
      </div>
    );
  }

  private _onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this._query = event.currentTarget.value;
    this.update();
  };

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

  private _canInsertImport(tokenName: string): boolean {
    const separatorIndex = tokenName.indexOf(':');
    if (separatorIndex <= 0) {
      return false;
    }
    const packageName = tokenName.slice(0, separatorIndex).trim();
    const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
    return (
      packageName.length > 0 &&
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tokenSymbol) &&
      this._isImportEnabled()
    );
  }

  private async _copyTokenName(tokenName: string): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tokenName);
      } else {
        Clipboard.copyToSystem(tokenName);
      }
      this._setCopiedState(tokenName);
    } catch (error) {
      try {
        Clipboard.copyToSystem(tokenName);
        this._setCopiedState(tokenName);
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
            ? error.message
            : 'Unknown clipboard error';
        await showDialog({
          title: 'Failed to copy token string',
          body: `Could not copy "${tokenName}". ${message}`,
          buttons: [Dialog.okButton()]
        });
      }
    }
  }

  private _setCopiedState(tokenName: string): void {
    this._copiedTokenName = tokenName;
    this.update();

    if (this._copiedTimer !== null) {
      window.clearTimeout(this._copiedTimer);
    }
    this._copiedTimer = window.setTimeout(() => {
      this._copiedTokenName = null;
      this._copiedTimer = null;
      this.update();
    }, 1200);
  }
}
