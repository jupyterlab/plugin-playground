
import json
import shutil
from pathlib import Path

HERE = Path(__file__).parent.resolve()
EXAMPLES = HERE / "extension-examples"

with (HERE / "labextension" / "package.json").open() as fid:
    data = json.load(fid)

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": data["name"]
    }]


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_plugin_playground"}]


def _load_jupyter_server_extension(server_app):
    root_dir = Path(server_app.root_dir).resolve()
    target = root_dir / "extension-examples"

    try:
        if target.is_dir() and any(target.iterdir()):
            return

        if not EXAMPLES.is_dir():
            server_app.log.warning(
                "Bundled 'extension-examples' was not found in the installed package."
            )
            return

        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                server_app.log.warning(
                    "Skipping population of bundled extension examples because %s "
                    "exists and is not a directory.",
                    target,
                )
                return

        shutil.copytree(EXAMPLES, target, ignore=shutil.ignore_patterns(".*"))
        server_app.log.info("Copied bundled extension examples to %s", target)
    except Exception as error:
        server_app.log.warning(
            "Failed to populate bundled extension examples in %s: %s",
            target,
            error,
        )
