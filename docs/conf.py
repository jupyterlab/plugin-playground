extensions = ["myst_parser", "jupyterlite_sphinx"]

jupyterlite_config = "jupyter_lite_config.json"
jupyterlite_dir = "."
jupyterlite_contents = "content"

master_doc = "index"
source_suffix = ".md"

# General information about the project.
project = "JupyterLab Plugin Playground"
author = "Project Jupyter"

exclude_patterns = []
highlight_language = "python"
pygments_style = "sphinx"

html_theme = "pydata_sphinx_theme"
html_theme_options = {
    "icon_links": [
        {
            "name": "jupyter.org",
            "url": "https://jupyter.org",
            "icon": "_static/jupyter_logo.svg",
            "type": "local",
        },
        {
            "name": "GitHub",
            "url": "https://github.com/jupyterlab/plugin-playground",
            "icon": "fab fa-github-square",
        },
    ],
}
html_static_path = ["_static"]

html_css_files = ["custom.css"]

PLAUSIBLE_SRC = "https://plausible.io/js/pa-Tem97Eeu4LJFfSRY89aW1.js"
PLAUSIBLE_INIT = (
    "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},"
    "plausible.init=plausible.init||function(i){plausible.o=i||{}};"
    "plausible.init({hashBasedRouting:true})"
)


def _ensure_extension_examples(root):
    import subprocess

    examples = root / "extension-examples"
    if (examples / "README.md").exists():
        return examples

    if (root / ".git").exists():
        try:
            subprocess.check_call(
                [
                    "git",
                    "submodule",
                    "update",
                    "--init",
                    "--recursive",
                    "extension-examples",
                ],
                cwd=str(root),
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(
                "Failed to initialize the 'extension-examples' submodule."
            ) from exc

        if (examples / "README.md").exists():
            return examples

        raise RuntimeError(
            "Submodule update completed but 'extension-examples' was not found."
        )

    raise RuntimeError(
        "Missing 'extension-examples'. Build from a git checkout with submodules "
        "initialized."
    )


def _sync_examples_to_lite_contents(root):
    import sys

    examples = _ensure_extension_examples(root)
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    from extension_examples_bundle import sync_extension_examples

    lite_examples_root = root / "docs" / "content" / "extension-examples"
    stats = sync_extension_examples(examples, lite_examples_root)
    print(
        "Copied "
        f"{stats.copied_examples} extension examples into docs/content for Lite "
        f"({stats.copied_files} files)."
    )


def _sync_agent_skills_to_lite_contents(root):
    import shutil

    source_skills_root = root / "_agents" / "skills"
    lite_skills_root = root / "docs" / "content" / "_agents" / "skills"

    if lite_skills_root.exists():
        shutil.rmtree(lite_skills_root)

    if not source_skills_root.exists():
        print("No _agents/skills directory found; skipping Lite skill sync.")
        return

    copied_count = 0
    for skill_dir in sorted(source_skills_root.iterdir()):
        if not skill_dir.is_dir() or skill_dir.name.startswith("."):
            continue
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        destination_dir = lite_skills_root / skill_dir.name
        destination_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skill_file, destination_dir / "SKILL.md")
        copied_count += 1

    print(f"Copied {copied_count} agent skills into docs/content for Lite.")


def on_config_inited(*args):
    import sys
    import subprocess
    from pathlib import Path

    HERE = Path(__file__)
    ROOT = HERE.parent.parent
    _sync_examples_to_lite_contents(ROOT)
    _sync_agent_skills_to_lite_contents(ROOT)

    subprocess.check_call(["jlpm"], cwd=str(ROOT))
    subprocess.check_call(["jlpm", "build"], cwd=str(ROOT))

    subprocess.check_call([sys.executable, "-m", "build"], cwd=str(ROOT))


def _inject_plausible_into_lite_html(outdir):
    from pathlib import Path

    lite_root = Path(outdir) / "lite"
    if not lite_root.exists():
        print("No Lite output directory found; skipping Plausible injection.")
        return

    html_files = sorted(lite_root.rglob("*.html"))
    if not html_files:
        print("No Lite HTML files found; skipping Plausible injection.")
        return

    snippet = (
        f'    <script async src="{PLAUSIBLE_SRC}"></script>\n'
        f"    <script>{PLAUSIBLE_INIT}</script>\n"
    )
    injected = 0
    already_present = 0
    skipped = 0

    for html_file in html_files:
        content = html_file.read_text(encoding="utf-8")
        if PLAUSIBLE_SRC in content or "window.plausible=window.plausible" in content:
            already_present += 1
            continue
        if "</head>" not in content:
            skipped += 1
            print(f"Skipping Plausible injection (no </head>): {html_file}")
            continue

        updated = content.replace("</head>", f"{snippet}</head>", 1)
        html_file.write_text(updated, encoding="utf-8")
        injected += 1

    print(
        "Plausible injection for Lite: "
        f"{injected} updated, {already_present} unchanged, {skipped} skipped."
    )


def on_build_finished(app, exception):
    if exception is not None:
        print("Sphinx build failed; skipping Plausible injection for Lite.")
        return

    _inject_plausible_into_lite_html(app.outdir)


def setup(app):
    app.add_js_file(PLAUSIBLE_SRC, loading_method="async")
    app.add_js_file(
        filename=None,
        body=PLAUSIBLE_INIT,
    )
    app.connect("config-inited", on_config_inited)
    app.connect("build-finished", on_build_finished)
