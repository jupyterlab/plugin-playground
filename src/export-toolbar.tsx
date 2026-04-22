import { ReactWidget } from '@jupyterlab/apputils';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { FileEditor } from '@jupyterlab/fileeditor';
import {
  caretDownEmptyIcon,
  downloadIcon,
  MenuSvg
} from '@jupyterlab/ui-components';

import { CommandRegistry } from '@lumino/commands';
import { Widget } from '@lumino/widgets';
import * as React from 'react';

import { ContentUtils } from './contents';
import {
  applySplitActionSelection,
  openMenuAtAnchor,
  registerSplitActionSelectionCommands,
  SplitActionButton,
  toolbarActionIconState,
  TOOLBAR_ACTION_ICON_CLASSNAME,
  TOOLBAR_ACTION_TRANSIENT_TIMEOUT_MS,
  type ISelectableSplitActionOption
} from './split-action';

export type ExportArchiveFormat = 'zip' | 'wheel';
export const DEFAULT_EXPORT_ARCHIVE_FORMAT: ExportArchiveFormat = 'zip';
export const EXPORT_EXTENSION_TOOLBAR_ITEM = 'export-extension';
const EXPORT_ARCHIVE_MENU_SELECT_ZIP =
  'plugin-playground:select-export-format-zip';
const EXPORT_ARCHIVE_MENU_SELECT_WHEEL =
  'plugin-playground:select-export-format-wheel';

const EXPORT_ARCHIVE_MENU_OPTIONS: ReadonlyArray<
  ISelectableSplitActionOption<ExportArchiveFormat>
> = [
  {
    command: EXPORT_ARCHIVE_MENU_SELECT_ZIP,
    label: 'Export as archive (.zip)',
    value: 'zip'
  },
  {
    command: EXPORT_ARCHIVE_MENU_SELECT_WHEEL,
    label: 'Export as Python package (.whl)',
    value: 'wheel'
  }
];

const EXPORT_ARCHIVE_MENU_ITEMS = EXPORT_ARCHIVE_MENU_OPTIONS.map(option => ({
  command: option.command
}));

function exportArchiveFormatLabel(format: ExportArchiveFormat): string {
  return format === 'wheel' ? 'Python package (.whl)' : 'archive (.zip)';
}

interface ICreateExportArchiveSplitWidgetOptions {
  editorWidget: IDocumentWidget<FileEditor>;
  hasDocumentManager: () => boolean;
  getSelectedFormat: () => ExportArchiveFormat;
  onExport: (format: ExportArchiveFormat) => Promise<{ ok: boolean } | null>;
  menu: MenuSvg;
}

interface ICreateExportArchiveSplitWidgetResult {
  widget: Widget;
  refresh: () => void;
}

function createExportArchiveSplitWidget(
  options: ICreateExportArchiveSplitWidgetOptions
): ICreateExportArchiveSplitWidgetResult {
  class ExportArchiveSplitWidget extends ReactWidget {
    dispose(): void {
      if (this._successTimer !== null) {
        clearTimeout(this._successTimer);
        this._successTimer = null;
      }
      this._successState = null;
      super.dispose();
    }

    render(): React.ReactElement {
      const normalizedPath = ContentUtils.normalizeContentsPath(
        options.editorWidget.context.path
      );
      const enabled = options.hasDocumentManager() && normalizedPath.length > 0;
      const selectedFormat = options.getSelectedFormat();
      const formatLabel = exportArchiveFormatLabel(selectedFormat);
      const primaryLabel =
        selectedFormat === 'wheel' ? 'Export .whl' : 'Export .zip';
      const showSuccessIcon = this._successState === 'success';
      const primaryIconState = toolbarActionIconState(
        showSuccessIcon,
        downloadIcon
      );
      const primaryTitle = showSuccessIcon
        ? `Exported plugin folder as ${formatLabel}`
        : `Export plugin folder as ${formatLabel}`;

      return React.createElement(SplitActionButton, {
        disabled: !enabled,
        onPrimaryClick: () => {
          void this._runExport(options.getSelectedFormat());
        },
        primaryAriaLabel: `Export plugin folder as ${formatLabel}`,
        primaryTitle,
        primaryContent: React.createElement(
          React.Fragment,
          null,
          React.createElement(primaryIconState.icon.react, {
            tag: 'span',
            elementSize: 'normal',
            className: primaryIconState.className
          }),
          React.createElement(
            'span',
            {
              className: 'jp-PluginPlayground-actionLabel'
            },
            primaryLabel
          )
        ),
        onMenuMouseDown: event => {
          event.preventDefault();
        },
        onMenuClick: anchorButton => {
          openMenuAtAnchor(
            options.menu,
            anchorButton,
            EXPORT_ARCHIVE_MENU_ITEMS
          );
        },
        menuAriaLabel: 'Choose export format',
        menuTitle: 'Choose export format',
        menuContent: React.createElement(caretDownEmptyIcon.react, {
          tag: 'span',
          elementSize: 'normal',
          className: TOOLBAR_ACTION_ICON_CLASSNAME
        })
      });
    }

    private async _runExport(format: ExportArchiveFormat): Promise<void> {
      const result = await options.onExport(format);
      if (result?.ok === true) {
        ContentUtils.setTransientStateWithTimeout<'success'>(
          'success',
          this._successTimer,
          timer => {
            this._successTimer = timer;
          },
          state => {
            this._successState = state;
          },
          () => {
            this.update();
          },
          TOOLBAR_ACTION_TRANSIENT_TIMEOUT_MS
        );
      }
    }

    private _successState: 'success' | null = null;
    private _successTimer: number | null = null;
  }

  const splitWidget = new ExportArchiveSplitWidget();

  const refresh = () => {
    splitWidget.update();
  };

  options.editorWidget.context.pathChanged.connect(refresh);

  let isDisposed = false;
  const dispose = () => {
    if (isDisposed) {
      return;
    }
    isDisposed = true;
    options.editorWidget.context.pathChanged.disconnect(refresh);
  };

  splitWidget.disposed.connect(dispose);
  options.editorWidget.disposed.connect(dispose);

  return {
    widget: splitWidget,
    refresh
  };
}

interface IExportToolbarControllerWidgetOptions {
  editorWidget: IDocumentWidget<FileEditor>;
  hasDocumentManager: () => boolean;
  onExport: (format: ExportArchiveFormat) => Promise<{ ok: boolean } | null>;
}

export class ExportToolbarController {
  constructor() {
    registerSplitActionSelectionCommands({
      commands: this._menuCommands,
      options: EXPORT_ARCHIVE_MENU_OPTIONS,
      getSelectedValue: () => this._selectedFormat,
      setSelectedValue: format => {
        applySplitActionSelection({
          currentValue: this._selectedFormat,
          nextValue: format,
          applySelection: value => {
            this._selectedFormat = value;
          },
          onChanged: () => {
            for (const refresh of this._refreshers) {
              refresh();
            }
          }
        });
      }
    });
  }

  createWidget(options: IExportToolbarControllerWidgetOptions): Widget {
    const exportWidget = createExportArchiveSplitWidget({
      editorWidget: options.editorWidget,
      hasDocumentManager: options.hasDocumentManager,
      getSelectedFormat: () => this._selectedFormat,
      onExport: options.onExport,
      menu: this._menu
    });
    const splitWidget = exportWidget.widget;
    const refresh = exportWidget.refresh;

    this._refreshers.add(refresh);
    refresh();

    let isDisposed = false;
    const dispose = () => {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      this._refreshers.delete(refresh);
    };

    splitWidget.disposed.connect(dispose);
    options.editorWidget.disposed.connect(dispose);

    return splitWidget;
  }

  private readonly _menuCommands = new CommandRegistry();
  private readonly _menu = new MenuSvg({
    commands: this._menuCommands
  });
  private readonly _refreshers = new Set<() => void>();
  private _selectedFormat: ExportArchiveFormat = DEFAULT_EXPORT_ARCHIVE_FORMAT;
}
