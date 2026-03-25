---
name: plugin-authoring
description: Bootstrap and iterate TypeScript/TSX JupyterLab plugins in Plugin Playground for plugin development, using command-driven workflows and extension references.
metadata:
  keywords:
    - jupyterlab
    - plugin-playground
    - plugin-authoring
    - plugin development
    - extension
    - typescript
    - tsx
    - token
    - command
---

# Plugin Authoring Skill (Playground)

Use this skill to bootstrap and iterate JupyterLab plugins inside **Plugin Playground**.

## Goal

Produce working plugin code that can be loaded with `plugin-playground:load-as-extension`, using extension points and examples available in the running environment.

## Inputs

- Desired behavior (what the plugin should do)
- Optional UI target (command palette, sidebar, status bar, notebook, etc.)
- Optional package constraints (JupyterLab-only APIs vs external AMD modules)

## Workflow

1. Prepare a TypeScript file

- If the user does not already have a plugin file open or specified, run `plugin-playground:create-new-plugin` with a meaningful `path` argument (for example `app.commands.execute('plugin-playground:create-new-plugin', { path: 'status-indicator.ts' })`) instead of relying on untitled defaults.
- Start from the generated TypeScript scaffold and adapt it.
- Focus on TypeScript/TSX plugin code. Do not scaffold Python projects (`pyproject.toml`, Python package layout) unless explicitly requested.

2. Discover available extension points

- Run `plugin-playground:list-tokens` to get available tokens.
- Run `plugin-playground:list-commands` to get available commands.
- Use optional `query` argument to narrow results:
  - `app.commands.execute('plugin-playground:list-tokens', { query: 'status' })`
  - `app.commands.execute('plugin-playground:list-commands', { query: 'notebook' })`

3. Discover reference examples

- Run `plugin-playground:list-extension-examples`.
- Filter by topic with `query` (for example `toolbar`, `commands`, `widget`, `notebook`).
- Open selected example source/README from the sidebar for implementation details.

4. Implement plugin code

- Start from a minimal plugin shape (`id`, `autoStart`, `activate`).
- Add `requires` tokens only after confirming availability from step 2.
- Add commands with stable IDs (`<namespace>:<action>`).
- Use one or more `.ts`/`.tsx` files as needed as complexity grows.

5. Load and iterate

- Run `plugin-playground:load-as-extension`.
- Validate behavior in UI.
- Check the command return value for `ok/status/message` to detect and report loading or autostart errors.
- If reloading the same plugin ID repeatedly, ensure cleanup is handled via `deactivate()` where needed.

6. Export for standalone development

- Run `plugin-playground:export-as-extension` to download a zip for local IDE + git workflows.
- For deterministic automation (or when another file is focused), pass an explicit file path:
  - `app.commands.execute('plugin-playground:export-as-extension', { path: 'my-extension/src/index.ts' })`
- Read export result metadata (`ok`, `archiveName`, `rootPath`, `fileCount`, `message`) and report failures.

7. Imports and module safety

- Prefer JupyterLab/Lumino imports first.
- For external packages, ensure AMD-compatible import targets are used.
- Avoid Node/Webpack-only modules that are not AMD-compatible.

## Output expectations

- TypeScript-first plugin implementation (`.ts`/`.tsx`)
- Clear command IDs and labels
- Minimal required tokens
- No unused imports

## References

- JupyterLab Extension Tutorial:
  - https://jupyterlab.readthedocs.io/en/stable/extension/extension_tutorial.html
- JupyterLab Extension Examples:
  - https://github.com/jupyterlab/extension-examples
