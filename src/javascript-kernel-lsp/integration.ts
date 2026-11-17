import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { showErrorMessage } from '@jupyterlab/apputils';
import {
  ILSPDocumentConnectionManager,
  type TSessionMap,
  type TSpecsMap
} from '@jupyterlab/lsp';
import type { Kernel } from '@jupyterlab/services';
import type { IJavaScriptKernelStartupRegistry } from '../javascript-kernel-vfs/startup';
import {
  JAVASCRIPT_KERNEL_LSP_COMM_TARGET,
  JAVASCRIPT_KERNEL_LSP_LANGUAGES,
  JAVASCRIPT_KERNEL_LSP_MIME_TYPES,
  JAVASCRIPT_KERNEL_LSP_SERVER_ID,
  JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME
} from '../javascript-kernel-vfs/constants';

/**
 * LSP spec requires a non-empty tuple of language identifiers.
 */
const JAVASCRIPT_KERNEL_LSP_LANGUAGE_LIST: [string, ...string[]] = [
  ...JAVASCRIPT_KERNEL_LSP_LANGUAGES
];

/**
 * MIME types exposed for the in-kernel TypeScript server.
 */
const JAVASCRIPT_KERNEL_LSP_MIME_TYPE_LIST: [string, ...string[]] = [
  ...JAVASCRIPT_KERNEL_LSP_MIME_TYPES
];

let sharedJavaScriptKernelConnection: Kernel.IKernelConnection | null = null;
const kernelLspErrorMessages = new Set<string>();

interface ILanguageServerManagerWithProviders {
  fetchSessions(): Promise<void>;
  registerProvider(provider: ILanguageServerProvider): void;
}

interface ILanguageServerProvider {
  readonly id: string;
  fetch(): Promise<{
    sessions: TSessionMap;
    specs: TSpecsMap;
    statusCode: number;
    transport: Record<string, (options: { socketUrl: string }) => WebSocket>;
  }>;
}

function reportKernelLspError(message: string, error: unknown): void {
  console.warn(message, error);
  if (kernelLspErrorMessages.has(message)) {
    return;
  }

  kernelLspErrorMessages.add(message);
  void showErrorMessage(
    message,
    error instanceof Error ? error.message : String(error)
  );
}

/**
 * Resolve a JavaScript kernel connection for comm-based LSP transport.
 *
 * A dedicated kernel is started for the current app lifecycle so the transport
 * is deterministic and does not depend on pre-existing running kernels.
 */
async function resolveJavaScriptKernelConnection(
  app: JupyterFrontEnd
): Promise<Kernel.IKernelConnection> {
  if (sharedJavaScriptKernelConnection?.isDisposed === false) {
    return sharedJavaScriptKernelConnection;
  }

  const kernelspecManager = app.serviceManager.kernelspecs;
  await kernelspecManager.ready;
  const kernelspecs = kernelspecManager.specs?.kernelspecs;
  if (!kernelspecs || !kernelspecs[JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME]) {
    throw new Error(
      `Expected JavaScript kernelspec "${JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME}" was not found.`
    );
  }

  const kernelManager = app.serviceManager.kernels;
  await kernelManager.ready;

  try {
    sharedJavaScriptKernelConnection = await kernelManager.startNew(
      {
        name: JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME
      },
      {
        handleComms: true
      }
    );
    return sharedJavaScriptKernelConnection;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not start JavaScript kernel "${JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME}" for LSP comm transport. ${message}`
    );
  }
}

/**
 * Create a minimal WebSocket-compatible class that tunnels JSON-RPC strings
 * over a Jupyter comm channel to the JavaScript kernel.
 */
function createKernelLspWebSocketClass(app: JupyterFrontEnd): typeof WebSocket {
  class KernelLspWebSocket {
    readonly url: string;

    onopen: ((this: WebSocket, ev: Event) => any) | null = null;
    onmessage: ((this: WebSocket, ev: MessageEvent<any>) => any) | null = null;
    onerror: ((this: WebSocket, ev: Event) => any) | null = null;
    onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;

    constructor(url: string) {
      this.url = url;
      void this._openCommConnection().catch(error => {
        const message =
          error instanceof Error ? error.message : String(error || 'Error');
        reportKernelLspError(
          'Plugin Playground kernel LSP comm transport failed.',
          error
        );
        this._emitError(message);
        this._closeInternal(1011, message, false);
      });
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (this._isClosed) {
        return;
      }

      const payload = String(data);
      if (!this._commChannel) {
        this._pendingPayloads.push(payload);
        return;
      }

      this._commChannel.send({ payload });
    }

    close(code = 1000, reason = ''): void {
      this._closeInternal(code, reason, true);
    }

    private async _openCommConnection(): Promise<void> {
      if (this._isClosed) {
        return;
      }

      const kernelConnection = await resolveJavaScriptKernelConnection(app);

      const commChannel = kernelConnection.createComm(
        JAVASCRIPT_KERNEL_LSP_COMM_TARGET
      );
      this._commChannel = commChannel;

      commChannel.onMsg = message => {
        const { payload } = message.content.data as { payload: string };
        if (this.onmessage) {
          this.onmessage.call(
            this as unknown as WebSocket,
            {
              data: payload
            } as MessageEvent
          );
        }
      };

      commChannel.onClose = () => {
        this._closeInternal(1000, 'Comm closed', false);
      };

      commChannel.open({
        serverId: JAVASCRIPT_KERNEL_LSP_SERVER_ID,
        languages: [...JAVASCRIPT_KERNEL_LSP_LANGUAGES]
      });

      if (this.onopen) {
        this.onopen.call(this as unknown as WebSocket, {} as Event);
      }

      this._flushPendingPayloads();
    }

    private _flushPendingPayloads(): void {
      const commChannel = this._commChannel;
      if (!commChannel) {
        return;
      }

      const pendingPayloads = this._pendingPayloads;
      this._pendingPayloads = [];
      for (const payload of pendingPayloads) {
        commChannel.send({ payload });
      }
    }

    private _emitError(message: string): void {
      if (!this.onerror) {
        return;
      }
      this.onerror.call(
        this as unknown as WebSocket,
        {
          message
        } as unknown as Event
      );
    }

    private _closeInternal(
      code: number,
      reason: string,
      shouldSendClose: boolean
    ): void {
      if (this._isClosed) {
        return;
      }

      this._isClosed = true;

      if (
        this._commChannel &&
        !this._commChannel.isDisposed &&
        shouldSendClose
      ) {
        try {
          this._commChannel.close({
            code,
            reason
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error || 'Error');
          this._emitError(message);
        }
      }
      this._commChannel = null;
      this._pendingPayloads = [];

      if (this.onclose) {
        this.onclose.call(
          this as unknown as WebSocket,
          {
            code,
            reason,
            wasClean: code === 1000
          } as CloseEvent
        );
      }
    }

    private _isClosed = false;
    private _pendingPayloads: string[] = [];
    private _commChannel: Kernel.IComm | null = null;
  }

  return KernelLspWebSocket as unknown as typeof WebSocket;
}

function registerKernelLspProvider(
  app: JupyterFrontEnd,
  languageServerManager: ILanguageServerManagerWithProviders
): void {
  const spec = {
    display_name: 'TypeScript (JavaScript Kernel)',
    languages: JAVASCRIPT_KERNEL_LSP_LANGUAGE_LIST,
    mime_types: JAVASCRIPT_KERNEL_LSP_MIME_TYPE_LIST,
    requires_documents_on_disk: false,
    version: 2 as const
  };
  const session = {
    handler_count: 1,
    last_handler_message_at: null,
    last_server_message_at: null,
    status: 'started',
    spec
  };
  const KernelLspWebSocket = createKernelLspWebSocketClass(app);

  languageServerManager.registerProvider({
    id: '@jupyterlab/plugin-playground:javascript-kernel-lsp-provider',
    fetch: async () => ({
      statusCode: 200,
      specs: new Map([[JAVASCRIPT_KERNEL_LSP_SERVER_ID, spec]]) as TSpecsMap,
      sessions: new Map([
        [JAVASCRIPT_KERNEL_LSP_SERVER_ID, session]
      ]) as TSessionMap,
      transport: {
        [JAVASCRIPT_KERNEL_LSP_SERVER_ID]: options =>
          new KernelLspWebSocket(options.socketUrl)
      }
    })
  });

  void languageServerManager.fetchSessions().catch(error => {
    reportKernelLspError(
      'Failed to initialize JavaScript kernel LSP provider sessions.',
      error
    );
  });
}

/**
 * Plugin that enables comm-based kernel LSP transport in Lite deployments.
 */
const javaScriptKernelLspCommsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/plugin-playground:javascript-kernel-lsp-comms',
  description:
    'Routes JupyterLab LSP WebSocket traffic through JavaScript kernel comms in Lite deployments.',
  autoStart: true,
  requires: [ILSPDocumentConnectionManager],
  activate: (
    app: JupyterFrontEnd,
    connectionManager: ILSPDocumentConnectionManager
  ): void => {
    const kernelspecManager = app.serviceManager.kernelspecs;
    let languageServerProviderRegistered = false;
    let languageServerProviderRegistrationPending = false;
    const registerIfJavaScriptKernelSpecAvailable = (): boolean => {
      const kernelspecs = kernelspecManager.specs?.kernelspecs;
      if (!kernelspecs || !kernelspecs[JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME]) {
        return false;
      }
      if (
        languageServerProviderRegistered ||
        languageServerProviderRegistrationPending
      ) {
        return true;
      }
      languageServerProviderRegistrationPending = true;
      void import('../javascript-kernel-vfs/startup')
        .then(
          async ({
            javaScriptKernelStartupToken,
            setupJavaScriptKernelVfs
          }) => {
            const startup =
              await app.resolveOptionalService<IJavaScriptKernelStartupRegistry>(
                javaScriptKernelStartupToken
              );
            if (!startup) {
              throw new Error(
                'The JavaScript kernel startup extension registry is unavailable.'
              );
            }

            const languageServerManager = (
              connectionManager as unknown as {
                languageServerManager: ILanguageServerManagerWithProviders;
              }
            ).languageServerManager;
            setupJavaScriptKernelVfs(startup);
            registerKernelLspProvider(app, languageServerManager);
            languageServerProviderRegistered = true;
          }
        )
        .catch(error => {
          languageServerProviderRegistrationPending = false;
          reportKernelLspError(
            'Failed to register JavaScript kernel LSP provider.',
            error
          );
        });
      return true;
    };

    if (registerIfJavaScriptKernelSpecAvailable()) {
      return;
    }

    const onKernelSpecsChanged = (): void => {
      if (!registerIfJavaScriptKernelSpecAvailable()) {
        return;
      }
      kernelspecManager.specsChanged.disconnect(onKernelSpecsChanged);
    };
    kernelspecManager.specsChanged.connect(onKernelSpecsChanged);

    void kernelspecManager.ready
      .then(() => {
        onKernelSpecsChanged();
      })
      .catch(error => {
        console.warn(
          'Kernel spec manager failed to become ready for kernel LSP comm setup.',
          error
        );
      });
  }
};

const javaScriptKernelLspPlugins: JupyterFrontEndPlugin<any>[] = [
  javaScriptKernelLspCommsPlugin
];

export { javaScriptKernelLspPlugins };
