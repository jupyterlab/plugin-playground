import { ReactWidget, addToolbarButtonClass } from '@jupyterlab/apputils';
import {
  caretDownEmptyIcon,
  checkIcon,
  shareIcon,
  type LabIcon
} from '@jupyterlab/ui-components';

import type { CommandRegistry } from '@lumino/commands';
import type { Message } from '@lumino/messaging';
import type { Widget } from '@lumino/widgets';
import * as React from 'react';

import { SplitActionButton } from './split-action';

export interface ICreateShareToolbarButtonOptions {
  commands: CommandRegistry;
  commandId: string;
  onPrimaryClick: () => void;
  onOpenMenu: (anchorButton: HTMLButtonElement) => void;
}

class ShareDropdownToolbarButton extends ReactWidget {
  constructor(private readonly _options: ICreateShareToolbarButtonOptions) {
    super();
    addToolbarButtonClass(this);
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._options.commands.commandChanged.connect(this._onCommandChanged, this);
  }

  protected onBeforeDetach(msg: Message): void {
    this._options.commands.commandChanged.disconnect(
      this._onCommandChanged,
      this
    );
    super.onBeforeDetach(msg);
  }

  render(): JSX.Element {
    const leadingIcon =
      (this._options.commands.icon(this._options.commandId, {}) as LabIcon) ??
      shareIcon;
    const isCopied = leadingIcon === checkIcon;
    const primaryTitle = isCopied
      ? 'Copied'
      : 'Share the current file by creating a copyable URL link';

    return (
      <SplitActionButton
        disabled={false}
        onPrimaryMouseDown={event => {
          event.preventDefault();
        }}
        onPrimaryClick={this._options.onPrimaryClick}
        primaryAriaLabel={
          isCopied ? 'Copied share link for current file' : 'Share current file'
        }
        primaryTitle={primaryTitle}
        primaryContent={
          <>
            {React.createElement(leadingIcon.react, {
              tag: 'span',
              elementSize: 'normal',
              className: 'jp-PluginPlayground-actionIcon'
            })}
            <span className="jp-PluginPlayground-actionLabel">Share</span>
          </>
        }
        onMenuMouseDown={event => {
          event.preventDefault();
        }}
        onMenuClick={this._options.onOpenMenu}
        menuAriaLabel="Choose share target"
        menuTitle="Choose share target"
        menuClassName="jp-PluginPlayground-shareDropdownButton"
        menuContent={React.createElement(caretDownEmptyIcon.react, {
          tag: 'span',
          elementSize: 'normal',
          className:
            'jp-PluginPlayground-actionIcon jp-PluginPlayground-shareDropdownCaretIcon'
        })}
      />
    );
  }

  private _onCommandChanged(
    _sender: CommandRegistry,
    change: CommandRegistry.ICommandChangedArgs
  ): void {
    if (
      change.type === 'many-changed' ||
      change.id === this._options.commandId
    ) {
      this.update();
    }
  }
}

export function createShareToolbarButton(
  options: ICreateShareToolbarButtonOptions
): Widget {
  return new ShareDropdownToolbarButton(options);
}
