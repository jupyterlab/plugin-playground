---
name: customize-jupyterlite
description: Customize the JupyterLab interface of the JupyterLite site that the user runs, and keep the changes after a page reload. Use this skill when the user wants to change the theme, the fonts, the layout or the default value of a setting, to hide or remove a part of the interface (status bar, side panel, menu), to disable or enable a plugin, to add a feature that loads at each start, or to undo one of these changes.
metadata:
  keywords:
    - jupyterlab
    - jupyterlite
    - plugin-playground
    - profile
    - customization
    - customize
    - look and feel
    - theme
    - font
    - layout
    - hide
    - settings
    - overrides
    - page config
    - disabledExtensions
    - disable plugin
    - startup plugin
---

# Customize JupyterLite Skill (Playground)

Use this skill when the user wants to change the look, the layout, or the behavior of the JupyterLite site that they use, and wants the change to stay after a page reload. The user can call the site JupyterLab, because JupyterLite shows the JupyterLab interface.

## How it works

The profile is a set of files in the `_profile` folder of the file browser. The browser stores them, so they belong to this user and this site only.

| File                         | Content                                                                  | Applied                                     |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `_profile/jupyter-lite.json` | Page config, in `jupyter-config-data`. For example `disabledExtensions`. | On the next page load.                      |
| `_profile/overrides.json`    | Default values of settings, by plugin id.                                | On the next page load.                      |
| `_profile/plugins/*.ts`      | Plugin source files. A folder with `src/index.ts` is also a plugin.      | Immediately when loaded, and at each start. |

These are the same file formats as the `jupyter-lite.json` and `overrides.json` files of a JupyterLite build. They merge on top of the configuration of the site.

Use the commands below to change the two JSON files. The commands validate the change and return the new state. Edit the files directly only for page config options that have no command.

## Workflow

All the commands of this skill start with `plugin-playground:`. One `discover_commands` call with the query `plugin-playground` returns all of them with their arguments.

1. Read the current state

- Run `plugin-playground:get-profile`.
- `pending` is what the next page load applies, `applied` is what this page load applied, `startupPlugins` lists the plugin files, and `problems` lists what was ignored and why.

2. Choose the smallest change

- To change how a feature looks or behaves, change a setting (step 3). Prefer this to disabling a plugin.
- To remove a feature, disable its plugin (step 4).
- To add a feature, write a startup plugin (step 5).

3. Change the default value of a setting

- Find the setting: `plugin-playground:list-settings` with a `query` (for example `theme`, `line numbers`, `font size`). Each item has `plugin`, `key`, `type` and `default`.
- Set it: `plugin-playground:override-setting` with `plugin`, `key` and `value`.
- When the `type` of the setting is `object`, the `value` replaces the complete `default` object. Copy the `default` object, and change only the necessary options.
- Remove it: the same command without `value`.
- A value that the user set replaces the default value. The user sets a value in the Settings Editor or in a menu. A command that changes a setting immediately (for example `apputils:change-theme`) also sets a value for the user, thus do not use such a command for a change that must stay.
- When the result has a `message`, the override has no effect because the user set a value. Give the content of the message to the user.

4. Disable or enable a plugin

- Find the plugin id: `plugin-playground:list-plugins` with a `query` (for example `statusbar`, `toc`, `launcher`). Each item has `id`, `extension`, `description` and `enabled`.
- When no plugin matches the query, the site does not have the feature. Tell the user.
- Disable it: `plugin-playground:disable-plugin` with `id`. Use the `extension` value as `id` to disable all the plugins of an extension.
- Enable it again: `plugin-playground:enable-plugin` with `id`.
- Other plugins can depend on the plugin that you disable. Disable one plugin at a time when you are not sure.

5. Add a startup plugin

- Follow the `plugin-authoring` skill to write the plugin, with the file in `_profile/plugins/`. For example: `plugin-playground:create-new-plugin` with `path: '/_profile/plugins/top-bar-clock.ts'`.
- Load it: `plugin-playground:load-as-extension` with `path: '_profile/plugins/top-bar-clock.ts'`. Check `ok`, `status` and `message` in the result, and correct the code until `ok` is `true`.
- The plugin is active immediately. It also loads at each start, because the file is in `_profile/plugins/`.
- To remove a startup plugin, delete or move its file.

6. Tell the user to reload

- When the result of a command has `reloadRequired: true`, tell the user to reload the page (a notification with a `Reload` button also shows).
- Do not reload the page yourself: a reload stops the conversation.

## Recovery

Safe mode starts the site without the profile and without the startup plugins, so that the files can be corrected. The site uses safe mode automatically when the last start in the same browser tab did not complete. The user can also add `?safe-mode` to the URL of the application (for example `/lab/index.html?safe-mode`).

## Examples

Dark theme by default:

```
plugin-playground:override-setting
{ "plugin": "@jupyterlab/apputils-extension:themes", "key": "theme", "value": "JupyterLab Dark" }
```

A larger font in all the editors, which include the notebook cells (the font options are in `customStyles`):

```
plugin-playground:override-setting
{ "plugin": "@jupyterlab/codemirror-extension:plugin", "key": "defaultConfig", "value": { "customStyles": { "fontSize": 16 } } }
```

No status bar:

```
plugin-playground:disable-plugin
{ "id": "@jupyterlab/statusbar-extension:plugin" }
```

A page config option without a command, in `_profile/jupyter-lite.json`:

```json
{
  "jupyter-lite-schema-version": 0,
  "jupyter-config-data": {
    "appName": "My Lab",
    "disabledExtensions": ["@jupyterlab/statusbar-extension:plugin"]
  }
}
```

## Limits

- Only JupyterLite supports this. In JupyterLab, `plugin-playground:get-profile` returns `supported: false`.
- The profile cannot enable a plugin that the site disabled, cannot disable Plugin Playground or the plugins that it needs, and cannot add prebuilt extensions.
- These page config options are ignored: `appUrl`, `baseUrl`, `federated_extensions`, `fullLabextensionsUrl`, `fullStaticUrl`.
