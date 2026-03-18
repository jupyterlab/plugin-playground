import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';

import { checkIcon, copyIcon, launchIcon } from '@jupyterlab/ui-components';

import { Message } from '@lumino/messaging';

import * as React from 'react';

import {
  copyValueToClipboard,
  openExternalLink,
  setCopiedStateWithTimeout
} from './contents';
import type { IKnownModule } from './known-modules';

export namespace JSImportExplorer {
  export interface IOptions {
    getKnownModules: () => ReadonlyArray<IKnownModule>;
    discoverModules: (force: boolean) => Promise<void>;
  }
}

export class JSImportExplorer extends ReactWidget {
  constructor(options: JSImportExplorer.IOptions) {
    super();
    this._getKnownModules = options.getKnownModules;
    this._discoverModules = options.discoverModules;
    this.addClass('jp-PluginPlayground-sidebar');
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    void this._discover(false);
  }

  dispose(): void {
    if (this._copiedTimer !== null) {
      window.clearTimeout(this._copiedTimer);
      this._copiedTimer = null;
    }
    super.dispose();
  }

  render(): JSX.Element {
    const modules = this._getKnownModules();
    const query = this._query.trim().toLowerCase();
    const filteredModules =
      query.length > 0
        ? modules.filter(known => {
            const haystack = [known.name, known.description, known.origin]
              .map(value => value ?? '')
              .join(' ')
              .toLowerCase();
            return haystack.includes(query);
          })
        : modules;

    return (
      <div className="jp-PluginPlayground-sidebarInner">
        <input
          className="jp-PluginPlayground-filter"
          type="search"
          placeholder="Filter module names"
          aria-label="Filter known modules"
          value={this._query}
          onChange={this._onQueryChange}
        />
        <p className="jp-PluginPlayground-count">
          {filteredModules.length} of {modules.length} known modules
        </p>
        {this._isDiscovering ? (
          <p className="jp-PluginPlayground-count">
            Discovering federated extension modules…
          </p>
        ) : null}
        {this._errorMessage ? (
          <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleError">
            Failed to discover federated modules: {this._errorMessage}
          </p>
        ) : null}
        {filteredModules.length === 0 ? (
          <p className="jp-PluginPlayground-count">No matching modules.</p>
        ) : (
          <ul className="jp-PluginPlayground-list">
            {filteredModules.map(known => {
              const links = this._knownModuleLinks(known);
              const description = this._knownModuleDescription(known);
              return (
                <li key={known.name} className="jp-PluginPlayground-listItem">
                  <div className="jp-PluginPlayground-row">
                    <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                      {known.name}
                    </code>
                    <div className="jp-PluginPlayground-tokenActions">
                      {links.map(link => (
                        <button
                          key={`${known.name}:${link.label}`}
                          className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton"
                          type="button"
                          onClick={() => {
                            openExternalLink(link.url);
                          }}
                          aria-label={`${link.ariaLabel} for ${known.name}`}
                          title={link.title}
                        >
                          {React.createElement(launchIcon.react, {
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
                          void (async () => {
                            try {
                              await copyValueToClipboard(known.name);
                              setCopiedStateWithTimeout(
                                known.name,
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
                                error instanceof Error
                                  ? error.message
                                  : 'Unknown clipboard error';
                              await showDialog({
                                title: 'Failed to copy module name',
                                body: `Could not copy "${known.name}". ${message}`,
                                buttons: [Dialog.okButton()]
                              });
                            }
                          })();
                        }}
                        aria-label={
                          this._copiedValue === known.name
                            ? `Copied module name ${known.name}`
                            : `Copy module name ${known.name}`
                        }
                        title={
                          this._copiedValue === known.name
                            ? 'Copied'
                            : 'Copy module name'
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
    );
  }

  private readonly _getKnownModules: () => ReadonlyArray<IKnownModule>;
  private readonly _discoverModules: (force: boolean) => Promise<void>;
  private _query = '';
  private _isDiscovering = false;
  private _errorMessage = '';
  private _copiedValue: string | null = null;
  private _copiedTimer: number | null = null;

  private _onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this._query = event.currentTarget.value;
    this.update();
  };

  private async _discover(force: boolean): Promise<void> {
    this._isDiscovering = true;
    this._errorMessage = '';
    this.update();

    try {
      await this._discoverModules(force);
    } catch (error) {
      this._errorMessage =
        error instanceof Error ? error.message : 'Unknown discovery error';
    } finally {
      this._isDiscovering = false;
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

  private _knownModuleLinks(
    known: IKnownModule
  ): Array<{ label: string; title: string; ariaLabel: string; url: string }> {
    const links: Array<{
      label: string;
      title: string;
      ariaLabel: string;
      url?: string;
    }> = [
      {
        label: 'Docs',
        title: 'Open documentation',
        ariaLabel: 'Open docs',
        url: known.urls?.docHtml
      },
      {
        label: 'npm',
        title: 'Open npm package page',
        ariaLabel: 'Open npm package',
        url: known.urls?.npmHtml
      },
      {
        label: 'Repo',
        title: 'Open repository',
        ariaLabel: 'Open repository',
        url: known.urls?.repositoryHtml
      },
      {
        label: 'Pkg',
        title: 'Open package.json',
        ariaLabel: 'Open package.json',
        url: known.urls?.packageJson
      }
    ];

    const seenUrls = new Set<string>();
    return links
      .filter(
        (
          link
        ): link is {
          label: string;
          title: string;
          ariaLabel: string;
          url: string;
        } => !!link.url
      )
      .filter(link => {
        const url = link.url.trim();
        if (seenUrls.has(url)) {
          return false;
        }
        seenUrls.add(url);
        return true;
      });
  }
}
