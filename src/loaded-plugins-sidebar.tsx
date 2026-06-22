import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';

import { stopIcon } from '@jupyterlab/ui-components';

import * as React from 'react';

export namespace LoadedPluginsSidebar {
  export interface ILoadedPluginRecord {
    id: string;
    sourcePath: string | null;
  }

  export interface IOptions {
    getLoadedPlugins: () => ReadonlyArray<ILoadedPluginRecord>;
    onDeactivate: (pluginId: string) => Promise<void>;
  }
}

export class LoadedPluginsSidebar extends ReactWidget {
  constructor(options: LoadedPluginsSidebar.IOptions) {
    super();
    this._getLoadedPlugins = options.getLoadedPlugins;
    this._onDeactivate = options.onDeactivate;
    this.addClass('jp-PluginPlayground-sidebar');
  }

  render(): JSX.Element {
    const loadedPlugins = this._getLoadedPlugins();

    return (
      <div className="jp-PluginPlayground-sidebarInner">
        {loadedPlugins.length === 0 ? (
          <p className="jp-PluginPlayground-count">
            No playground plugins are currently loaded.
          </p>
        ) : (
          <ul className="jp-PluginPlayground-list">
            {loadedPlugins.map(plugin => {
              const isDeactivating = this._deactivatingPluginIds.has(plugin.id);
              return (
                <li key={plugin.id} className="jp-PluginPlayground-listItem">
                  <div className="jp-PluginPlayground-row">
                    <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                      {plugin.id}
                    </code>
                    <div className="jp-PluginPlayground-tokenActions">
                      <button
                        className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-deactivateButton"
                        type="button"
                        disabled={isDeactivating}
                        onClick={() => {
                          void this._deactivate(plugin.id);
                        }}
                        aria-label={`Deactivate ${plugin.id}`}
                        title="Deactivate plugin"
                      >
                        {React.createElement(stopIcon.react, {
                          tag: 'span',
                          elementSize: 'normal',
                          className: 'jp-PluginPlayground-actionIcon'
                        })}
                        <span className="jp-PluginPlayground-actionLabel">
                          Deactivate
                        </span>
                      </button>
                    </div>
                  </div>
                  <p className="jp-PluginPlayground-description">
                    {plugin.sourcePath ?? 'Unknown source'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  private async _deactivate(pluginId: string): Promise<void> {
    this._deactivatingPluginIds.add(pluginId);
    this.update();
    try {
      await this._onDeactivate(pluginId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown deactivation error';
      await showDialog({
        title: 'Plugin deactivation failed',
        body: `Could not deactivate "${pluginId}". ${message}`,
        buttons: [Dialog.okButton()]
      });
    } finally {
      this._deactivatingPluginIds.delete(pluginId);
      this.update();
    }
  }

  private readonly _getLoadedPlugins: () => ReadonlyArray<LoadedPluginsSidebar.ILoadedPluginRecord>;
  private readonly _onDeactivate: (pluginId: string) => Promise<void>;
  private readonly _deactivatingPluginIds = new Set<string>();
}
