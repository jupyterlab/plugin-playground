import { createJavaScriptKernelVfsInitCode } from './bootstrap';

const JAVASCRIPT_KERNEL_VFS_LSP_TARGET_EXPORT =
  'registerPluginPlaygroundTypeScriptLspTarget';

function createJavaScriptKernelVfsStartupModuleUrl(): string {
  const initCode = createJavaScriptKernelVfsInitCode();
  const moduleSource = `${initCode}

export function ${JAVASCRIPT_KERNEL_VFS_LSP_TARGET_EXPORT}(comm) {
  return globalThis.__pluginPlaygroundRegisterTypeScriptLspTarget(comm);
}
`;

  return URL.createObjectURL(
    new Blob([moduleSource], { type: 'text/javascript' })
  );
}

export {
  createJavaScriptKernelVfsStartupModuleUrl,
  JAVASCRIPT_KERNEL_VFS_LSP_TARGET_EXPORT
};
