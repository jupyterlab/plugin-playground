import { JupyterFrontEnd } from '@jupyterlab/application';
import { Notification } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { Contents } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  checkIcon,
  fileIcon,
  folderIcon,
  type LabIcon,
  MenuSvg,
  shareIcon
} from '@jupyterlab/ui-components';

import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import type { Widget } from '@lumino/widgets';

import { ContentUtils } from './contents';
import { ShareLink } from './share-link';
import {
  buildFolderSharePayload,
  type IFolderShareCandidateFile,
  selectFolderSharePaths,
  shouldSkipFolderShareEntry
} from './share-via-link-utils';
import { openMenuAtAnchor } from './split-action';
import { createShareToolbarButton } from './share-toolbar';

export const SHARE_LINK_TOOLBAR_ITEM = 'share-extension-link';
export const SHARE_FOLDER_SELECTION_DIALOG_MODE_SETTING =
  'shareFolderSelectionDialogMode';

export type ShareFolderSelectionDialogMode =
  | 'always'
  | 'auto-excluded-or-limit'
  | 'limit-only';

export const DEFAULT_SHARE_FOLDER_SELECTION_DIALOG_MODE: ShareFolderSelectionDialogMode =
  'always';

export const SHARE_VIA_LINK_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: {
      type: 'string',
      description:
        'Optional contents path of the file or folder to share. When omitted, the active editor file is used.'
    },
    useBrowserSelection: {
      type: 'boolean',
      description:
        'When true, resolve the share path from the current file browser selection.'
    },
    useContextTarget: {
      type: 'boolean',
      description:
        'When true, resolve the share path from the current context-menu target.'
    },
    shareVariant: {
      type: 'string',
      enum: ['file', 'package'],
      description:
        'Internal UI variant used by the Share toolbar dropdown label.'
    }
  }
} as const;

const ARCHIVE_FILE_READ_CONCURRENCY = 8;
const SHARE_LINK_COPY_TIMEOUT_MS = 1400;
const SHARED_LINKS_ROOT = 'plugin-playground-shared';

export interface IPluginShareResult {
  ok: boolean;
  link: string | null;
  sourcePath: string | null;
  urlLength: number;
  message?: string;
}

interface IShareCommandArgs {
  path?: unknown;
  useBrowserSelection?: unknown;
  useContextTarget?: unknown;
  shareVariant?: unknown;
}

export interface IShareViaLinkControllerOptions {
  app: JupyterFrontEnd;
  editorTracker: IEditorTracker;
  fileBrowserFactory: IFileBrowserFactory | null;
  settings: ISettingRegistry.ISettings;
  commandId: string;
  readSourceFileForExport: (path: string) => Promise<string>;
  collectArchiveFilePaths: (rootPath: string) => Promise<string[]>;
  mapWithConcurrency: <T, R>(
    items: ReadonlyArray<T>,
    concurrency: number,
    mapper: (item: T) => Promise<R>
  ) => Promise<R[]>;
  relativePath: (rootPath: string, path: string) => string;
  joinPath: (base: string, child: string) => string;
  onShowSharedFileToolbarCue: (
    widget: IDocumentWidget<FileEditor>,
    sourcePath: string
  ) => void;
}

export class ShareViaLinkController {
  constructor(private readonly _options: IShareViaLinkControllerOptions) {
    this._menu = new MenuSvg({
      commands: this._options.app.commands
    });
    this._settings = this._options.settings;
  }

  setSettings(settings: ISettingRegistry.ISettings): void {
    this._settings = settings;
  }

  updateSettingsComposite(composite: Record<string, unknown>): void {
    const dialogMode = composite[SHARE_FOLDER_SELECTION_DIALOG_MODE_SETTING];
    this._shareFolderSelectionDialogMode =
      dialogMode === 'always' ||
      dialogMode === 'auto-excluded-or-limit' ||
      dialogMode === 'limit-only'
        ? dialogMode
        : DEFAULT_SHARE_FOLDER_SELECTION_DIALOG_MODE;
  }

  createToolbarWidget(widget: IDocumentWidget<FileEditor>): Widget {
    return createShareToolbarButton({
      commands: this._options.app.commands,
      commandId: this._options.commandId,
      onPrimaryClick: this._shareCurrentFileViaLink.bind(this, widget),
      onOpenMenu: this._openShareLinkDropdown.bind(this, widget)
    });
  }

  commandLabel(args: ReadonlyPartialJSONObject): string {
    const variant = this._shareVariant(args);
    if (variant === 'file') {
      return 'Share Single File';
    }
    if (variant === 'package') {
      return 'Share Package';
    }
    return 'Copy Shareable Plugin Link';
  }

  commandCaption(args: ReadonlyPartialJSONObject): string {
    const variant = this._shareVariant(args);
    if (variant === 'file') {
      return 'Create a URL for the current file and copy it';
    }
    if (variant === 'package') {
      return 'Create a URL for the current package folder and copy it';
    }
    return 'Create a URL for the active plugin file or selected folder, then copy it';
  }

  commandIcon(args: ReadonlyPartialJSONObject): LabIcon {
    const variant = this._shareVariant(args);
    if (variant === 'file') {
      return fileIcon;
    }
    if (variant === 'package') {
      return folderIcon;
    }
    return this._copiedCommandId === this._options.commandId
      ? checkIcon
      : shareIcon;
  }

  isCommandEnabled(args: ReadonlyPartialJSONObject): boolean {
    const variant = this._shareVariant(args);
    if (variant === 'package') {
      const rawPath = (args as IShareCommandArgs).path;
      const requestedPath =
        typeof rawPath === 'string'
          ? ContentUtils.normalizeContentsPath(rawPath)
          : '';
      return requestedPath.length > 0;
    }
    return true;
  }

  async executeCommand(
    args: ReadonlyPartialJSONObject
  ): Promise<IPluginShareResult> {
    const commandArgs = args as IShareCommandArgs;
    const rawRequestedPath =
      typeof commandArgs.path === 'string' ? commandArgs.path : undefined;
    const useBrowserSelection = commandArgs.useBrowserSelection === true;
    const useContextTarget = commandArgs.useContextTarget === true;

    if (useBrowserSelection && !rawRequestedPath) {
      if (useContextTarget) {
        const contextTargetPath = this._resolveContextTargetPath();
        if (contextTargetPath) {
          return this._shareViaLink(contextTargetPath);
        }
        const message =
          'Could not resolve the context-menu target. Right-click a single file or folder and try again.';
        Notification.warning(message, { autoClose: 5000 });
        return {
          ok: false,
          link: null,
          sourcePath: null,
          urlLength: 0,
          message
        };
      }

      const selectedItems = this._selectedBrowserItems();
      if (selectedItems.length === 1) {
        return this._shareViaLink(selectedItems[0].path);
      }
      const message =
        selectedItems.length === 0
          ? 'No file or folder is selected in the file browser.'
          : 'Select a single file or folder in the file browser to share.';
      Notification.warning(message, { autoClose: 5000 });
      return {
        ok: false,
        link: null,
        sourcePath: null,
        urlLength: 0,
        message
      };
    }

    const requestedPath = rawRequestedPath
      ? ContentUtils.normalizeContentsPath(rawRequestedPath)
      : '';
    const currentWidget = this._options.editorTracker.currentWidget;
    const currentPath = currentWidget
      ? ContentUtils.normalizeContentsPath(currentWidget.context.path)
      : '';
    const activeSource =
      currentWidget && currentPath && currentPath === requestedPath
        ? currentWidget.context.model.toString()
        : undefined;

    if (requestedPath) {
      return this._shareViaLink(requestedPath, activeSource);
    }

    if (
      !currentWidget ||
      currentWidget !== this._options.app.shell.currentWidget
    ) {
      return {
        ok: false,
        link: null,
        sourcePath: null,
        urlLength: 0,
        message:
          'No active editor is available. Pass a path argument to share a specific file or folder.'
      };
    }

    return this._shareViaLink(
      ContentUtils.normalizeContentsPath(currentWidget.context.path),
      currentWidget.context.model.toString()
    );
  }

  async loadSharedPluginFromUrl(): Promise<void> {
    const sharedToken = ShareLink.getSharedPluginTokenFromLocation();
    if (!sharedToken) {
      return;
    }
    ShareLink.clearSharedPluginTokenFromLocation();

    try {
      const payload = await ShareLink.decodeSharedPluginPayload(sharedToken);
      const sharedEntries = ShareLink.payloadEntries(payload);
      if (sharedEntries.length === 0) {
        throw new Error('Shared payload does not include any files.');
      }

      const rootName = ShareLink.payloadRootName(payload);
      const baseRootFolder = ShareLink.sharedPluginFolderName(
        rootName,
        sharedToken
      );
      const maxVariants = 100;
      let rootPath = '';

      for (let variant = 1; variant <= maxVariants; variant++) {
        const folderName =
          variant === 1 ? baseRootFolder : `${baseRootFolder}-${variant}`;
        const candidateRootPath = ContentUtils.normalizeContentsPath(
          this._options.joinPath(SHARED_LINKS_ROOT, folderName)
        );

        let isCompatible = true;
        for (const entry of sharedEntries) {
          const candidatePath = ContentUtils.normalizeContentsPath(
            this._options.joinPath(candidateRootPath, entry.relativePath)
          );
          const existingFile = await ContentUtils.getFileModel(
            this._options.app.serviceManager,
            candidatePath
          );
          if (!existingFile) {
            continue;
          }
          const existingSource = ContentUtils.fileModelToText(existingFile);
          if (existingSource !== entry.source) {
            isCompatible = false;
            break;
          }
        }

        if (isCompatible) {
          rootPath = candidateRootPath;
          break;
        }
      }

      if (!rootPath) {
        throw new Error(
          `Could not find a writable location for shared files under "${SHARED_LINKS_ROOT}/${baseRootFolder}".`
        );
      }

      await ContentUtils.ensureContentsDirectory(
        this._options.app.serviceManager,
        rootPath
      );

      const restoredPaths: string[] = [];
      for (const entry of sharedEntries) {
        const entryPath = ContentUtils.normalizeContentsPath(
          this._options.joinPath(rootPath, entry.relativePath)
        );
        const entryDirectory = PathExt.dirname(entryPath);
        if (entryDirectory) {
          await ContentUtils.ensureContentsDirectory(
            this._options.app.serviceManager,
            entryDirectory
          );
        }

        const existingFile = await ContentUtils.getFileModel(
          this._options.app.serviceManager,
          entryPath
        );
        const existingSource = ContentUtils.fileModelToText(existingFile);
        if (existingSource !== entry.source) {
          const saved = await this._options.app.serviceManager.contents.save(
            entryPath,
            {
              type: 'file',
              format: 'text',
              content: entry.source
            }
          );
          if (!saved || saved.type !== 'file') {
            throw new Error(`Failed to save shared file at "${entryPath}".`);
          }
          const normalizedSavedPath = ContentUtils.normalizeContentsPath(
            saved.path
          );
          if (normalizedSavedPath !== entryPath) {
            throw new Error(
              `Shared file was saved to unexpected path "${normalizedSavedPath}" instead of "${entryPath}".`
            );
          }
        }

        let restoredFile = await ContentUtils.getFileModel(
          this._options.app.serviceManager,
          entryPath
        );
        for (let attempt = 0; !restoredFile && attempt < 8; attempt++) {
          await new Promise<void>(resolve => {
            window.setTimeout(resolve, 75);
          });
          restoredFile = await ContentUtils.getFileModel(
            this._options.app.serviceManager,
            entryPath
          );
        }
        if (!restoredFile) {
          throw new Error(
            `Shared file "${entryPath}" could not be found after restore.`
          );
        }
        restoredPaths.push(
          ContentUtils.normalizeContentsPath(restoredFile.path)
        );
      }

      const openedPath = this._preferredOpenedPath(restoredPaths, rootPath);
      await this._options.app.commands.execute('docmanager:open', {
        path: openedPath,
        factory: 'Editor'
      });
      let restoredWidget: IDocumentWidget<FileEditor> | null = null;
      this._options.editorTracker.forEach(candidate => {
        if (
          !restoredWidget &&
          ContentUtils.normalizeContentsPath(candidate.context.path) ===
            openedPath
        ) {
          restoredWidget = candidate;
        }
      });
      if (restoredWidget) {
        this._options.onShowSharedFileToolbarCue(restoredWidget, openedPath);
      }
      const fileCount = restoredPaths.length;
      const openedLocation = fileCount === 1 ? openedPath : rootPath;
      Notification.success(
        `Opened shared plugin from URL at "${openedLocation}" ` +
          `(${fileCount} file${fileCount === 1 ? '' : 's'}).`,
        {
          autoClose: 6000
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Failed to load shared plugin from URL: ${message}`, {
        autoClose: false
      });
    }
  }

  private _shareVariant(
    args: ReadonlyPartialJSONObject
  ): 'file' | 'package' | null {
    const rawVariant = (args as IShareCommandArgs).shareVariant;
    if (rawVariant === 'file' || rawVariant === 'package') {
      return rawVariant;
    }
    return null;
  }

  private _resolveContextTargetPath(): string {
    const contextTarget = this._options.app.contextMenuHitTest(node =>
      node.classList.contains('jp-DirListing-item')
    );
    const contextTargetName = contextTarget?.querySelector(
      '.jp-DirListing-itemText'
    )?.textContent;
    if (
      typeof contextTargetName !== 'string' ||
      contextTargetName.length === 0 ||
      contextTargetName === '..'
    ) {
      return '';
    }

    const browserDirectory = ContentUtils.normalizeContentsPath(
      this._options.fileBrowserFactory?.tracker.currentWidget?.model.path ?? ''
    );
    return ContentUtils.normalizeContentsPath(
      browserDirectory
        ? PathExt.join(browserDirectory, contextTargetName)
        : contextTargetName
    );
  }

  private _selectedBrowserItems(): Contents.IModel[] {
    const selectedItems: Contents.IModel[] = [];
    const selectedItemsIterator =
      this._options.fileBrowserFactory?.tracker.currentWidget?.selectedItems();
    if (!selectedItemsIterator) {
      return selectedItems;
    }

    for (
      let result = selectedItemsIterator.next();
      !result.done;
      result = selectedItemsIterator.next()
    ) {
      const item = result.value;
      if (item.type === 'file' || item.type === 'directory') {
        selectedItems.push(item);
      }
    }

    return selectedItems;
  }

  private async _shareCurrentFileViaLink(
    widget: IDocumentWidget<FileEditor>
  ): Promise<void> {
    const filePath = ContentUtils.normalizeContentsPath(widget.context.path);
    if (!filePath) {
      return;
    }
    await this._shareViaLink(filePath, widget.context.model.toString());
  }

  private async _openShareLinkDropdown(
    widget: IDocumentWidget<FileEditor>,
    anchor: HTMLButtonElement
  ): Promise<void> {
    const filePath = ContentUtils.normalizeContentsPath(widget.context.path);
    if (!filePath) {
      return;
    }

    const sourceDirectory = ContentUtils.normalizeContentsPath(
      PathExt.dirname(filePath)
    );
    const parentDirectory = ContentUtils.normalizeContentsPath(
      PathExt.dirname(sourceDirectory)
    );
    const packageDirectoryCandidates = [sourceDirectory];
    if (
      parentDirectory &&
      parentDirectory !== sourceDirectory &&
      !packageDirectoryCandidates.includes(parentDirectory)
    ) {
      packageDirectoryCandidates.push(parentDirectory);
    }
    let packagePath = '';
    for (const directoryPath of packageDirectoryCandidates) {
      const packageJsonPath = this._options.joinPath(
        directoryPath,
        'package.json'
      );
      const packageJson = await ContentUtils.getFileModel(
        this._options.app.serviceManager,
        packageJsonPath
      );
      if (packageJson) {
        packagePath = directoryPath;
        break;
      }
    }

    openMenuAtAnchor(this._menu, anchor, [
      {
        command: this._options.commandId,
        args: { path: filePath, shareVariant: 'file' }
      },
      {
        command: this._options.commandId,
        args: {
          path: packagePath,
          shareVariant: 'package'
        }
      }
    ]);
  }

  private async _shareViaLink(
    sourcePath: string,
    activeSource?: string
  ): Promise<IPluginShareResult> {
    const normalizedSourcePath = ContentUtils.normalizeContentsPath(sourcePath);
    let sharedSourcePath = normalizedSourcePath;
    if (!normalizedSourcePath) {
      return {
        ok: false,
        link: null,
        sourcePath: null,
        urlLength: 0,
        message: 'Share path is empty.'
      };
    }

    try {
      const directory = await ContentUtils.getDirectoryModel(
        this._options.app.serviceManager,
        normalizedSourcePath
      );

      if (directory) {
        sharedSourcePath = ContentUtils.normalizeContentsPath(directory.path);
        const folderShareData = await this._collectShareableFolderFiles(
          sharedSourcePath
        );
        const files = folderShareData.files;
        if (files.length === 0) {
          throw new Error(
            `No text-readable files were found in "${sharedSourcePath}".`
          );
        }
        const defaultIncludedFiles = files.filter(file => !file.autoExcluded);

        const shouldOpenSelectionDialogByMode =
          this._shareFolderSelectionDialogMode === 'always' ||
          (this._shareFolderSelectionDialogMode === 'auto-excluded-or-limit' &&
            folderShareData.hasAutoExcludedFiles);

        if (shouldOpenSelectionDialogByMode) {
          return this._openFolderShareSelectionDialog(
            sharedSourcePath,
            files,
            this._shareFolderSelectionDialogMode === 'always' &&
              !folderShareData.hasAutoExcludedFiles
          );
        }

        if (defaultIncludedFiles.length === 0) {
          return this._openFolderShareSelectionDialog(
            sharedSourcePath,
            files,
            false
          );
        }

        const payload = buildFolderSharePayload(
          sharedSourcePath,
          defaultIncludedFiles
        );
        const linkResult = await ShareLink.createSharedPluginLink(payload);
        if (!linkResult.ok) {
          this._notifyFolderShareTooLarge(
            linkResult.message ?? 'Share link creation failed.',
            sharedSourcePath,
            files
          );
          return {
            ok: false,
            link: null,
            sourcePath: sharedSourcePath,
            urlLength: linkResult.urlLength,
            message: linkResult.message
          };
        }
        return this._finalizeShareLinkCopy(linkResult.link, sharedSourcePath);
      }
      const source =
        activeSource ??
        (await this._options.readSourceFileForExport(sharedSourcePath));
      const fileName = PathExt.basename(sharedSourcePath) || 'plugin.ts';
      const payload: ShareLink.ISharedPluginPayload = {
        version: 1,
        kind: 'file',
        fileName,
        source
      };
      const linkResult = await ShareLink.createSharedPluginLink(payload);
      if (!linkResult.ok) {
        const message =
          `${linkResult.message ?? 'Share link creation failed.'} ` +
          'Share a smaller file or use "Export Plugin Folder As Extension".';
        Notification.error(message, {
          autoClose: false
        });
        return {
          ok: false,
          link: null,
          sourcePath: sharedSourcePath,
          urlLength: linkResult.urlLength,
          message
        };
      }

      return this._finalizeShareLinkCopy(linkResult.link, sharedSourcePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Plugin share link creation failed: ${message}`, {
        autoClose: false
      });
      return {
        ok: false,
        link: null,
        sourcePath: sharedSourcePath,
        urlLength: 0,
        message
      };
    }
  }

  private async _collectShareableFolderFiles(folderPath: string): Promise<{
    files: IFolderShareCandidateFile[];
    hasAutoExcludedFiles: boolean;
  }> {
    const filePaths = await this._options.collectArchiveFilePaths(folderPath);
    const textEncoder = new TextEncoder();
    const candidates = await this._options.mapWithConcurrency(
      filePaths,
      ARCHIVE_FILE_READ_CONCURRENCY,
      async (filePath): Promise<IFolderShareCandidateFile | null> => {
        const relativePath = this._options.relativePath(folderPath, filePath);
        const autoExcluded = shouldSkipFolderShareEntry(relativePath);

        const fileModel = await ContentUtils.getFileModel(
          this._options.app.serviceManager,
          filePath
        );
        if (!fileModel || fileModel.format === 'base64') {
          return null;
        }

        const source = ContentUtils.fileModelToText(fileModel);
        if (source === null) {
          return null;
        }

        return {
          relativePath,
          source,
          sizeBytes: textEncoder.encode(source).length,
          autoExcluded
        };
      }
    );

    const files = candidates.filter(
      (candidate): candidate is IFolderShareCandidateFile => candidate !== null
    );

    return {
      files,
      hasAutoExcludedFiles: files.some(file => file.autoExcluded)
    };
  }

  private _notifyFolderShareTooLarge(
    message: string,
    folderPath: string,
    files: ReadonlyArray<IFolderShareCandidateFile>
  ): void {
    Notification.error(`${message} Select specific files to continue.`, {
      autoClose: false,
      actions: [
        {
          label: 'Select files',
          displayType: 'accent',
          callback: () => {
            void this._openFolderShareSelectionDialog(folderPath, files, false);
          }
        }
      ]
    });
  }

  private async _openFolderShareSelectionDialog(
    folderPath: string,
    files: ReadonlyArray<IFolderShareCandidateFile>,
    includeDisableDialogCheckbox: boolean
  ): Promise<IPluginShareResult> {
    try {
      const selectionResult = await selectFolderSharePaths(
        folderPath,
        files,
        includeDisableDialogCheckbox
      );
      if (selectionResult === null) {
        return {
          ok: false,
          link: null,
          sourcePath: folderPath,
          urlLength: 0,
          message: 'Folder share selection was cancelled.'
        };
      }

      const selectedPaths = selectionResult.selectedPaths;
      if (selectedPaths.length === 0) {
        Notification.warning('Select at least one file to share.', {
          autoClose: 5000
        });
        return {
          ok: false,
          link: null,
          sourcePath: folderPath,
          urlLength: 0,
          message: 'Select at least one file to share.'
        };
      }

      const selectedPathSet = new Set(selectedPaths);
      const selectedFiles = files.filter(file =>
        selectedPathSet.has(file.relativePath)
      );
      const payload = buildFolderSharePayload(folderPath, selectedFiles);

      const linkResult = await ShareLink.createSharedPluginLink(payload);
      if (!linkResult.ok) {
        if (linkResult.reason === 'length') {
          const message =
            `The selected files still produce a ${linkResult.urlLength}-character link ` +
            `(limit: ${ShareLink.SHARE_URL_MAX_LENGTH}). Select fewer files.`;
          Notification.error(message, { autoClose: false });
          return {
            ok: false,
            link: null,
            sourcePath: folderPath,
            urlLength: linkResult.urlLength,
            message
          };
        }
        const fallbackMessage = `${
          linkResult.message ?? 'Share link creation failed.'
        } Select fewer files.`;
        Notification.error(fallbackMessage, {
          autoClose: false
        });
        return {
          ok: false,
          link: null,
          sourcePath: folderPath,
          urlLength: linkResult.urlLength,
          message: fallbackMessage
        };
      }

      const result = await this._finalizeShareLinkCopy(
        linkResult.link,
        folderPath
      );
      const allFilesSelected = selectedPaths.length === files.length;
      if (
        includeDisableDialogCheckbox &&
        allFilesSelected &&
        selectionResult.disableDialogIfAllFilesCanBeIncluded
      ) {
        try {
          await this._settings.set(
            SHARE_FOLDER_SELECTION_DIALOG_MODE_SETTING,
            'auto-excluded-or-limit'
          );
          this._shareFolderSelectionDialogMode = 'auto-excluded-or-limit';
        } catch (error) {
          console.warn(
            `Failed to persist "${SHARE_FOLDER_SELECTION_DIALOG_MODE_SETTING}" setting.`,
            error
          );
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Plugin share link creation failed: ${message}`, {
        autoClose: false
      });
      return {
        ok: false,
        link: null,
        sourcePath: folderPath,
        urlLength: 0,
        message
      };
    }
  }

  private async _finalizeShareLinkCopy(
    link: string,
    sourcePath: string
  ): Promise<IPluginShareResult> {
    const urlLength = link.length;
    await ContentUtils.copyValueToClipboard(link);
    ContentUtils.setCopiedStateWithTimeout(
      this._options.commandId,
      this._copiedCommandTimer,
      timer => {
        this._copiedCommandTimer = timer;
      },
      copiedCommandId => {
        this._copiedCommandId = copiedCommandId;
      },
      () => {
        this._options.app.commands.notifyCommandChanged(
          this._options.commandId
        );
      },
      SHARE_LINK_COPY_TIMEOUT_MS
    );
    const details = `Copied a share link for "${sourcePath}" (${urlLength} characters).`;

    if (urlLength > ShareLink.SHARE_URL_WARN_LENGTH) {
      Notification.warning(
        `${details} Some browsers may reject very long URLs.`,
        {
          autoClose: 7000
        }
      );
    } else {
      Notification.success(details, {
        autoClose: 5000
      });
    }
    return {
      ok: true,
      link,
      sourcePath,
      urlLength
    };
  }

  private _preferredOpenedPath(
    restoredPaths: ReadonlyArray<string>,
    rootPath: string
  ): string {
    const preferredRelativePaths = [
      'src/index.ts',
      'src/index.js',
      'index.ts',
      'index.js'
    ];
    for (const preferredRelativePath of preferredRelativePaths) {
      const match = restoredPaths.find(path => {
        const relativePath = ContentUtils.normalizeContentsPath(
          this._options.relativePath(rootPath, path)
        ).replace(/^\.\//, '');
        return relativePath === preferredRelativePath;
      });
      if (match) {
        return match;
      }
    }
    return restoredPaths[0];
  }

  private readonly _menu: MenuSvg;
  private _settings: ISettingRegistry.ISettings;
  private _shareFolderSelectionDialogMode: ShareFolderSelectionDialogMode =
    DEFAULT_SHARE_FOLDER_SELECTION_DIALOG_MODE;
  private _copiedCommandId: string | null = null;
  private _copiedCommandTimer: number | null = null;
}
