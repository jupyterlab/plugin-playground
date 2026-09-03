/**
 * Kernel spec names exposed by jupyterlite-javascript-kernel.
 */
const JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME = 'javascript-worker';

/**
 * Comm target used for LSP JSON-RPC payloads.
 */
const JAVASCRIPT_KERNEL_LSP_COMM_TARGET = 'plugin-playground:lsp';

/**
 * Server id surfaced to JupyterLab LSP manager.
 */
const JAVASCRIPT_KERNEL_LSP_SERVER_ID = 'javascript-typescript-langserver';

/**
 * Languages served by the in-kernel TypeScript LSP endpoint.
 */
const JAVASCRIPT_KERNEL_LSP_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact'
] as const;

/**
 * MIME types exposed for the in-kernel TypeScript server.
 */
const JAVASCRIPT_KERNEL_LSP_MIME_TYPES = [
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'application/typescript',
  'text/x-typescript'
] as const;

export {
  JAVASCRIPT_PRIMARY_KERNEL_SPEC_NAME,
  JAVASCRIPT_KERNEL_LSP_COMM_TARGET,
  JAVASCRIPT_KERNEL_LSP_SERVER_ID,
  JAVASCRIPT_KERNEL_LSP_LANGUAGES,
  JAVASCRIPT_KERNEL_LSP_MIME_TYPES
};
