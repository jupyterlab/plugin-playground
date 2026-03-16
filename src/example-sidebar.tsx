import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';

import { codeIcon, markdownIcon } from '@jupyterlab/ui-components';

import * as React from 'react';

import { Message } from '@lumino/messaging';

export namespace ExampleSidebar {
  export interface IExampleRecord {
    name: string;
    path: string;
    readmePath: string;
    description: string;
  }

  export interface IOptions {
    fetchExamples: () => Promise<ReadonlyArray<IExampleRecord>>;
    onOpenExample: (examplePath: string) => Promise<void> | void;
    onOpenReadme: (readmePath: string) => Promise<void> | void;
  }
}

export class ExampleSidebar extends ReactWidget {
  constructor(options: ExampleSidebar.IOptions) {
    super();
    this._fetchExamples = options.fetchExamples;
    this._onOpenExample = options.onOpenExample;
    this._onOpenReadme = options.onOpenReadme;
    this.addClass('jp-PluginPlayground-sidebar');
    this.addClass('jp-PluginPlayground-exampleSidebar');
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    void this._loadExamples();
  }

  render(): JSX.Element {
    const query = this._query.trim().toLowerCase();
    const filteredExamples =
      query.length > 0
        ? this._examples.filter(example => {
            return (
              example.name.toLowerCase().includes(query) ||
              example.description.toLowerCase().includes(query)
            );
          })
        : this._examples;

    return (
      <div className="jp-PluginPlayground-sidebarInner jp-PluginPlayground-exampleSidebarInner">
        <input
          className="jp-PluginPlayground-filter jp-PluginPlayground-exampleFilter"
          type="search"
          placeholder="Filter extension examples"
          value={this._query}
          onChange={this._onQueryChange}
        />
        <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleCount">
          {filteredExamples.length} of {this._examples.length} extension
          examples
        </p>
        {this._isLoading ? (
          <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleCount">
            Loading extension examples…
          </p>
        ) : null}
        {this._errorMessage ? (
          <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleError">
            Failed to load extension examples: {this._errorMessage}
          </p>
        ) : null}
        {!this._isLoading &&
        !this._errorMessage &&
        filteredExamples.length === 0 ? (
          <div className="jp-PluginPlayground-emptyState">
            <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleCount">
              No extension examples found in <code>extension-examples/</code>.
            </p>
            <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleCount">
              If this repository was cloned from source, run{' '}
              <code>git submodule update --init --recursive</code> from the
              project root.
            </p>
            <p className="jp-PluginPlayground-count jp-PluginPlayground-exampleCount">
              If installed from PyPI, clone{' '}
              <code>https://github.com/jupyterlab/extension-examples</code> as{' '}
              <code>extension-examples/</code> in your working directory and
              refresh JupyterLab.
            </p>
          </div>
        ) : null}
        {filteredExamples.length > 0 ? (
          <ul className="jp-PluginPlayground-list jp-PluginPlayground-exampleList">
            {filteredExamples.map(example => (
              <li
                key={example.path}
                className="jp-PluginPlayground-listItem jp-PluginPlayground-exampleListItem"
              >
                <div className="jp-PluginPlayground-row jp-PluginPlayground-exampleRow">
                  <span className="jp-PluginPlayground-entryLabel jp-PluginPlayground-exampleName">
                    {example.name}
                  </span>
                  <div className="jp-PluginPlayground-actions jp-PluginPlayground-exampleActions">
                    <button
                      className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-exampleOpenButton"
                      type="button"
                      aria-label={`Open source for ${example.name}`}
                      title="Open example source file"
                      onClick={() => {
                        void this._openExample(example);
                      }}
                    >
                      {React.createElement(codeIcon.react, {
                        tag: 'span',
                        elementSize: 'normal',
                        className:
                          'jp-PluginPlayground-actionIcon jp-PluginPlayground-exampleActionIcon'
                      })}
                      <span className="jp-PluginPlayground-actionLabel">
                        Code
                      </span>
                    </button>
                    <button
                      className="jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-actionButton jp-PluginPlayground-exampleReadmeButton"
                      type="button"
                      aria-label={`Open README for ${example.name}`}
                      title="Open example README"
                      onClick={() => {
                        void this._openReadme(example);
                      }}
                    >
                      {React.createElement(markdownIcon.react, {
                        tag: 'span',
                        elementSize: 'normal',
                        className:
                          'jp-PluginPlayground-actionIcon jp-PluginPlayground-exampleActionIcon'
                      })}
                      <span className="jp-PluginPlayground-actionLabel">
                        README
                      </span>
                    </button>
                  </div>
                </div>
                <p className="jp-PluginPlayground-description jp-PluginPlayground-exampleDescription">
                  {example.description}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  private _onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this._query = event.currentTarget.value;
    this.update();
  };

  private async _loadExamples(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = '';
    this.update();
    try {
      this._examples = await this._fetchExamples();
    } catch (error) {
      this._examples = [];
      this._errorMessage =
        error instanceof Error
          ? error.message
          : 'Could not load extension examples.';
    } finally {
      this._isLoading = false;
      this.update();
    }
  }

  private async _openExample(
    example: ExampleSidebar.IExampleRecord
  ): Promise<void> {
    await this._openPath(
      example.path,
      this._onOpenExample,
      'example source file'
    );
  }

  private async _openReadme(
    example: ExampleSidebar.IExampleRecord
  ): Promise<void> {
    await this._openPath(
      example.readmePath,
      this._onOpenReadme,
      'example README'
    );
  }

  private async _openPath(
    path: string,
    openPath: (path: string) => Promise<void> | void,
    label: string
  ): Promise<void> {
    try {
      await openPath(path);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown opening error';
      await showDialog({
        title: 'Failed to open extension example file',
        body: `Could not open ${label} "${path}". ${message}`,
        buttons: [Dialog.okButton()]
      });
    }
  }

  private readonly _fetchExamples: () => Promise<
    ReadonlyArray<ExampleSidebar.IExampleRecord>
  >;
  private readonly _onOpenExample: (
    examplePath: string
  ) => Promise<void> | void;
  private readonly _onOpenReadme: (readmePath: string) => Promise<void> | void;
  private _query = '';
  private _examples: ReadonlyArray<ExampleSidebar.IExampleRecord> = [];
  private _isLoading = false;
  private _errorMessage = '';
}
