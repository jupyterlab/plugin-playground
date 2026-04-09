import { MenuSvg } from '@jupyterlab/ui-components';
import type { ReadonlyJSONObject } from '@lumino/coreutils';
import * as React from 'react';

const SPLIT_ACTION_CONTAINER_CLASSNAME =
  'jp-PluginPlayground-commandInsertSplit';
const SPLIT_ACTION_PRIMARY_BUTTON_CLASSNAME =
  'jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-commandInsertButton';
const SPLIT_ACTION_MENU_BUTTON_CLASSNAME =
  'jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-commandInsertMenuButton jp-PluginPlayground-commandInsertDropdownButton';

export interface IMenuCommandItem {
  command: string;
  args?: ReadonlyJSONObject;
}

export function openMenuAtAnchor(
  menu: MenuSvg,
  anchorButton: HTMLElement,
  items: ReadonlyArray<IMenuCommandItem>
): void {
  menu.clearItems();
  for (const item of items) {
    menu.addItem(item);
  }
  const anchorRect = anchorButton.getBoundingClientRect();
  const splitRect = anchorButton.parentElement?.getBoundingClientRect();
  menu.open(splitRect?.left ?? anchorRect.left, anchorRect.bottom);
}

interface ISplitActionButtonProps {
  disabled: boolean;
  primaryAriaLabel: string;
  primaryTitle: string;
  menuAriaLabel: string;
  menuTitle: string;
  onPrimaryClick: () => void;
  onMenuClick: (anchorButton: HTMLButtonElement) => void;
  primaryContent: React.ReactNode;
  menuContent: React.ReactNode;
  onPrimaryMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMenuMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function SplitActionButton(props: ISplitActionButtonProps): JSX.Element {
  return (
    <div className={SPLIT_ACTION_CONTAINER_CLASSNAME}>
      <button
        className={SPLIT_ACTION_PRIMARY_BUTTON_CLASSNAME}
        type="button"
        onMouseDown={props.onPrimaryMouseDown}
        onClick={props.onPrimaryClick}
        disabled={props.disabled}
        aria-label={props.primaryAriaLabel}
        title={props.primaryTitle}
      >
        {props.primaryContent}
      </button>
      <button
        className={SPLIT_ACTION_MENU_BUTTON_CLASSNAME}
        type="button"
        onMouseDown={props.onMenuMouseDown}
        onClick={event => {
          props.onMenuClick(event.currentTarget);
        }}
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-label={props.menuAriaLabel}
        title={props.menuTitle}
      >
        {props.menuContent}
      </button>
    </div>
  );
}
