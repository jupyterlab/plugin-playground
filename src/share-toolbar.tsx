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

import {
  SplitActionButton,
  toolbarActionIconState,
  TOOLBAR_ACTION_ICON_CLASSNAME
} from './split-action';

export interface ICreateShareToolbarButtonOptions {
  commands: CommandRegistry;
  commandId: string;
  getSelectedVariant: () => ShareToolbarVariant;
  onPrimaryClick: (variant: ShareToolbarVariant) => void;
  onOpenMenu: (anchorButton: HTMLButtonElement) => void;
}

export type ShareToolbarVariant = 'file' | 'package';

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
    const commandIcon =
      (this._options.commands.icon(this._options.commandId, {}) as LabIcon) ??
      shareIcon;
    const selectedVariant = this._options.getSelectedVariant();
    const isCopied = commandIcon === checkIcon;
    const primaryLabel =
      selectedVariant === 'package' ? 'Share Package' : 'Share File';
    const primaryIconState = toolbarActionIconState(isCopied, commandIcon);
    const primaryTitle = isCopied
      ? 'Copied'
      : selectedVariant === 'package'
      ? 'Share the current package folder by creating a copyable URL link'
      : 'Share the current file by creating a copyable URL link';
    const primaryAriaLabel = isCopied
      ? 'Copied share link'
      : selectedVariant === 'package'
      ? 'Share package'
      : 'Share file';

    return (
      <SplitActionButton
        disabled={false}
        onPrimaryMouseDown={event => {
          event.preventDefault();
        }}
        onPrimaryClick={() => {
          this._options.onPrimaryClick(selectedVariant);
        }}
        primaryAriaLabel={primaryAriaLabel}
        primaryTitle={primaryTitle}
        primaryContent={
          <>
            {React.createElement(primaryIconState.icon.react, {
              tag: 'span',
              elementSize: 'normal',
              className: primaryIconState.className
            })}
            <span className="jp-PluginPlayground-actionLabel">
              {primaryLabel}
            </span>
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
          className: `${TOOLBAR_ACTION_ICON_CLASSNAME} jp-PluginPlayground-shareDropdownCaretIcon`
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
