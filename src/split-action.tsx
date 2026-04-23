import { checkIcon, MenuSvg, type LabIcon } from '@jupyterlab/ui-components';
import type { CommandRegistry } from '@lumino/commands';
import type { ReadonlyJSONObject } from '@lumino/coreutils';
import * as React from 'react';

const SPLIT_ACTION_CONTAINER_CLASSNAME = 'jp-PluginPlayground-splitAction';
const SPLIT_ACTION_PRIMARY_BUTTON_CLASSNAME =
  'jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-splitActionPrimaryButton';
const SPLIT_ACTION_MENU_BUTTON_CLASSNAME =
  'jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-splitActionMenuButton jp-PluginPlayground-splitActionDropdownButton';

export const TOOLBAR_ACTION_ICON_CLASSNAME = 'jp-PluginPlayground-actionIcon';
export const TOOLBAR_ACTION_SUCCESS_ICON_CLASSNAME = `${TOOLBAR_ACTION_ICON_CLASSNAME} jp-PluginPlayground-actionSuccessIcon`;
export const TOOLBAR_ACTION_TRANSIENT_TIMEOUT_MS = 1400;

export function toolbarActionIconState(
  showSuccessIcon: boolean,
  defaultIcon: LabIcon
): { icon: LabIcon; className: string } {
  if (showSuccessIcon) {
    return {
      icon: checkIcon,
      className: TOOLBAR_ACTION_SUCCESS_ICON_CLASSNAME
    };
  }
  return {
    icon: defaultIcon,
    className: TOOLBAR_ACTION_ICON_CLASSNAME
  };
}

export interface IMenuCommandItem {
  command: string;
  args?: ReadonlyJSONObject;
}

export interface ISelectableSplitActionOption<T extends string> {
  command: string;
  label: string;
  value: T;
  isEnabled?: () => boolean;
}

interface IRegisterSplitActionSelectionCommandsOptions<T extends string> {
  commands: CommandRegistry;
  options: ReadonlyArray<ISelectableSplitActionOption<T>>;
  getSelectedValue: () => T;
  setSelectedValue: (value: T) => void;
}

export function registerSplitActionSelectionCommands<T extends string>(
  args: IRegisterSplitActionSelectionCommandsOptions<T>
): void {
  for (const option of args.options) {
    args.commands.addCommand(option.command, {
      label: option.label,
      describedBy: { args: null },
      isToggled: () => args.getSelectedValue() === option.value,
      isEnabled: option.isEnabled,
      execute: () => {
        args.setSelectedValue(option.value);
      }
    });
  }
}

export function setSplitActionSelection<T extends string>(
  currentValue: T,
  nextValue: T,
  applySelection: (value: T) => void
): boolean {
  if (currentValue === nextValue) {
    return false;
  }
  applySelection(nextValue);
  return true;
}

interface IApplySplitActionSelectionOptions<T extends string> {
  currentValue: T;
  nextValue: T;
  applySelection: (value: T) => void;
  onChanged?: () => void;
}

export function applySplitActionSelection<T extends string>(
  options: IApplySplitActionSelectionOptions<T>
): boolean {
  const didChange = setSplitActionSelection(
    options.currentValue,
    options.nextValue,
    options.applySelection
  );
  if (!didChange) {
    return false;
  }
  options.onChanged?.();
  return true;
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
  containerClassName?: string;
  primaryClassName?: string;
  menuClassName?: string;
}

export function SplitActionButton(props: ISplitActionButtonProps): JSX.Element {
  const containerClassName = props.containerClassName
    ? `${SPLIT_ACTION_CONTAINER_CLASSNAME} ${props.containerClassName}`
    : SPLIT_ACTION_CONTAINER_CLASSNAME;
  const primaryClassName = props.primaryClassName
    ? `${SPLIT_ACTION_PRIMARY_BUTTON_CLASSNAME} ${props.primaryClassName}`
    : SPLIT_ACTION_PRIMARY_BUTTON_CLASSNAME;
  const menuClassName = props.menuClassName
    ? `${SPLIT_ACTION_MENU_BUTTON_CLASSNAME} ${props.menuClassName}`
    : SPLIT_ACTION_MENU_BUTTON_CLASSNAME;

  return (
    <div className={containerClassName}>
      <button
        className={primaryClassName}
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
        className={menuClassName}
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
