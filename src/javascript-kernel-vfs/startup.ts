import type { Token } from '@lumino/coreutils';
import type { IJavaScriptKernelStartupRegistry } from '@jupyterlite/javascript-kernel/lib/startup';
import {
  createJavaScriptKernelVfsStartupModuleUrl,
  JAVASCRIPT_KERNEL_VFS_LSP_TARGET_EXPORT
} from './common';
import { JAVASCRIPT_KERNEL_LSP_COMM_TARGET } from './constants';

const JAVASCRIPT_KERNEL_VFS_STARTUP_EXTENSION_ID =
  '@jupyterlab/plugin-playground:javascript-kernel-vfs-lsp';

declare const require: (module: string) => {
  IJavaScriptKernelStartupRegistry: Token<IJavaScriptKernelStartupRegistry>;
};

const {
  IJavaScriptKernelStartupRegistry: javaScriptKernelStartupToken
} = require('@jupyterlite/javascript-kernel');

function setupJavaScriptKernelVfs(
  startup: IJavaScriptKernelStartupRegistry
): void {
  const module = createJavaScriptKernelVfsStartupModuleUrl();
  startup.registerStartupExtension({
    id: JAVASCRIPT_KERNEL_VFS_STARTUP_EXTENSION_ID,
    activate: context =>
      context.registerCommTarget({
        targetName: JAVASCRIPT_KERNEL_LSP_COMM_TARGET,
        module,
        exportName: JAVASCRIPT_KERNEL_VFS_LSP_TARGET_EXPORT
      }),
    deactivate: context =>
      context.unregisterCommTarget(JAVASCRIPT_KERNEL_LSP_COMM_TARGET)
  });
}

export { javaScriptKernelStartupToken, setupJavaScriptKernelVfs };
export type { IJavaScriptKernelStartupRegistry };
