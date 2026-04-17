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
import { openMenuAtAnchor, SplitActionButton } from './split-action';

export type ExportArchiveFormat = 'zip' | 'wheel';
export const DEFAULT_EXPORT_ARCHIVE_FORMAT: ExportArchiveFormat = 'zip';
export const EXPORT_EXTENSION_TOOLBAR_ITEM = 'export-extension';
const EXPORT_ARCHIVE_MENU_SELECT_ZIP =
  'plugin-playground:select-export-format-zip';
const EXPORT_ARCHIVE_MENU_SELECT_WHEEL =
  'plugin-playground:select-export-format-wheel';

const EXPORT_ARCHIVE_MENU_ITEMS = [
  { command: EXPORT_ARCHIVE_MENU_SELECT_ZIP },
  { command: EXPORT_ARCHIVE_MENU_SELECT_WHEEL }
];

function exportArchiveFormatLabel(format: ExportArchiveFormat): string {
  return format === 'wheel' ? 'Python package (.whl)' : 'archive (.zip)';
}

function registerExportArchiveMenuCommands(
  commands: CommandRegistry,
  getSelectedFormat: () => ExportArchiveFormat,
  setSelectedFormat: (format: ExportArchiveFormat) => void
): void {
  commands.addCommand(EXPORT_ARCHIVE_MENU_SELECT_ZIP, {
    label: 'Export as archive (.zip)',
    describedBy: { args: null },
    isToggled: () => getSelectedFormat() === 'zip',
    execute: () => {
      setSelectedFormat('zip');
    }
  });
  commands.addCommand(EXPORT_ARCHIVE_MENU_SELECT_WHEEL, {
    label: 'Export as Python package (.whl)',
    describedBy: { args: null },
    isToggled: () => getSelectedFormat() === 'wheel',
    execute: () => {
      setSelectedFormat('wheel');
    }
  });
}

interface ICreateExportArchiveSplitWidgetOptions {
  editorWidget: IDocumentWidget<FileEditor>;
  hasDocumentManager: () => boolean;
  getSelectedFormat: () => ExportArchiveFormat;
  onExport: (format: ExportArchiveFormat) => void;
  menu: MenuSvg;
}

interface ICreateExportArchiveSplitWidgetResult {
  widget: Widget;
  refresh: () => void;
}

function createExportArchiveSplitWidget(
  options: ICreateExportArchiveSplitWidgetOptions
): ICreateExportArchiveSplitWidgetResult {
  const SplitView = (): React.ReactElement => {
    const normalizedPath = ContentUtils.normalizeContentsPath(
      options.editorWidget.context.path
    );
    const enabled = options.hasDocumentManager() && normalizedPath.length > 0;
    const selectedFormat = options.getSelectedFormat();
    const formatLabel = exportArchiveFormatLabel(selectedFormat);

    return React.createElement(SplitActionButton, {
      disabled: !enabled,
      onPrimaryClick: () => {
        options.onExport(options.getSelectedFormat());
      },
      primaryAriaLabel: `Export plugin folder as ${formatLabel}`,
      primaryTitle: `Export plugin folder as ${formatLabel}`,
      primaryContent: React.createElement(
        React.Fragment,
        null,
        React.createElement(downloadIcon.react, {
          tag: 'span',
          elementSize: 'normal',
          className: 'jp-PluginPlayground-actionIcon'
        }),
        React.createElement(
          'span',
          {
            className: 'jp-PluginPlayground-actionLabel'
          },
          'Export'
        )
      ),
      onMenuMouseDown: event => {
        event.preventDefault();
      },
      onMenuClick: anchorButton => {
        openMenuAtAnchor(options.menu, anchorButton, EXPORT_ARCHIVE_MENU_ITEMS);
      },
      menuAriaLabel: 'Choose export format',
      menuTitle: 'Choose export format',
      menuContent: React.createElement(caretDownEmptyIcon.react, {
        tag: 'span',
        elementSize: 'normal',
        className: 'jp-PluginPlayground-actionIcon'
      })
    });
  };
  const splitWidget = ReactWidget.create(React.createElement(SplitView));

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
  onExport: (format: ExportArchiveFormat) => void;
}

export class ExportToolbarController {
  constructor() {
    registerExportArchiveMenuCommands(
      this._menuCommands,
      () => this._selectedFormat,
      format => {
        this._setSelectedFormat(format);
      }
    );
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

  private _setSelectedFormat(format: ExportArchiveFormat): void {
    if (this._selectedFormat === format) {
      return;
    }
    this._selectedFormat = format;
    for (const refresh of this._refreshers) {
      refresh();
    }
  }

  private readonly _menuCommands = new CommandRegistry();
  private readonly _menu = new MenuSvg({
    commands: this._menuCommands
  });
  private readonly _refreshers = new Set<() => void>();
  private _selectedFormat: ExportArchiveFormat = DEFAULT_EXPORT_ARCHIVE_FORMAT;
}
