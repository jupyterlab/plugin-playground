import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';

import {
  checkIcon,
  deleteIcon,
  LabIcon,
  launchIcon
} from '@jupyterlab/ui-components';

import * as React from 'react';

import { ProfileManager, reloadApplication } from './profile';

export namespace ProfileSidebar {
  export interface IOptions {
    manager: ProfileManager;
    onOpenFile: (path: string) => void;
  }
}

interface IEntry {
  label: string;
  description?: React.ReactNode;
  action: string;
  /**
   * The accessible name of the action button, unique in the sidebar.
   */
  ariaLabel: string;
  icon: LabIcon;
  run: () => unknown;
}

/**
 * A sidebar section that shows the profile of a JupyterLite site.
 */
export class ProfileSidebar extends ReactWidget {
  constructor(options: ProfileSidebar.IOptions) {
    super();
    this._manager = options.manager;
    this._onOpenFile = options.onOpenFile;
    this.addClass('jp-PluginPlayground-sidebar');
    this._manager.changed.connect(this.update, this);
  }

  dispose(): void {
    this._manager.changed.disconnect(this.update, this);
    super.dispose();
  }

  render(): JSX.Element {
    const status = this._manager.status;
    const disabled = status.pending.disabledExtensions ?? [];
    const overrides = status.pending.settingsOverrides ?? {};

    return (
      <div className="jp-PluginPlayground-sidebarInner">
        {this._renderStatus(status)}
        {status.problems.length > 0 ? (
          <ul className="jp-PluginPlayground-profileProblems">
            {status.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {this._renderGroup(
          'Disabled plugins',
          disabled.map(id => ({
            label: id,
            action: 'Enable',
            ariaLabel: `Enable ${id}`,
            icon: checkIcon,
            run: () => this._manager.setPluginEnabled(id, true)
          }))
        )}
        {this._renderGroup(
          'Settings overrides',
          Object.entries(overrides).flatMap(([plugin, values]) =>
            Object.entries(values).map(([key, value]) => ({
              label: key,
              description: (
                <>
                  {plugin}
                  <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                    {JSON.stringify(value)}
                  </code>
                </>
              ),
              action: 'Remove',
              ariaLabel: `Remove override ${plugin} ${key}`,
              icon: deleteIcon,
              run: () => this._manager.overrideSetting(plugin, key, undefined)
            }))
          )
        )}
        {this._renderGroup(
          'Startup plugins',
          status.startupPlugins.map(path => ({
            label: path,
            action: 'Open',
            ariaLabel: `Open ${path}`,
            icon: launchIcon,
            run: () => this._onOpenFile(path)
          }))
        )}
      </div>
    );
  }

  private _renderStatus(status: ProfileManager.IStatus): JSX.Element {
    let message = 'The profile is applied.';
    let reloadLabel: string | null = null;
    if (status.safeMode) {
      message = 'Safe mode: the profile is not applied.';
      reloadLabel = 'Leave safe mode';
    } else if (status.reloadRequired) {
      message = 'Reload the page to apply the changes.';
      reloadLabel = 'Reload';
    } else if (
      Object.keys(status.pending).length === 0 &&
      status.startupPlugins.length === 0
    ) {
      message = 'The profile is empty.';
    }
    return (
      <div className="jp-PluginPlayground-row">
        <p className="jp-PluginPlayground-count">{message}</p>
        {reloadLabel ? (
          <button
            className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton"
            type="button"
            onClick={reloadApplication}
          >
            {reloadLabel}
          </button>
        ) : null}
      </div>
    );
  }

  private _renderGroup(title: string, entries: IEntry[]): JSX.Element | null {
    if (entries.length === 0) {
      return null;
    }
    return (
      <>
        <h3 className="jp-PluginPlayground-profileHeading">{title}</h3>
        <ul className="jp-PluginPlayground-list">
          {entries.map(entry => (
            <li key={entry.ariaLabel} className="jp-PluginPlayground-listItem">
              <div className="jp-PluginPlayground-row">
                <code className="jp-PluginPlayground-entryLabel jp-PluginPlayground-tokenString">
                  {entry.label}
                </code>
                <div className="jp-PluginPlayground-tokenActions">
                  <button
                    className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton"
                    type="button"
                    disabled={this._runningActions.has(entry.ariaLabel)}
                    onClick={() => {
                      void this._run(entry);
                    }}
                    aria-label={entry.ariaLabel}
                    title={entry.ariaLabel}
                  >
                    {React.createElement(entry.icon.react, {
                      tag: 'span',
                      elementSize: 'normal',
                      className: 'jp-PluginPlayground-actionIcon'
                    })}
                    <span className="jp-PluginPlayground-actionLabel">
                      {entry.action}
                    </span>
                  </button>
                </div>
              </div>
              {entry.description ? (
                <p className="jp-PluginPlayground-description">
                  {entry.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    );
  }

  private async _run(entry: IEntry): Promise<void> {
    this._runningActions.add(entry.ariaLabel);
    this.update();
    try {
      await entry.run();
    } catch (error) {
      await showDialog({
        title: 'The profile change failed',
        body: error instanceof Error ? error.message : String(error),
        buttons: [Dialog.okButton()]
      });
    } finally {
      this._runningActions.delete(entry.ariaLabel);
      this.update();
    }
  }

  private readonly _manager: ProfileManager;
  private readonly _onOpenFile: (path: string) => void;
  private readonly _runningActions = new Set<string>();
}
