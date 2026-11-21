"""Build the JupyterLite site for the integration tests.

The site has the agent skills of the repository in its contents, as the
documentation site does, and the Galata extension for the test helpers.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import jupyterlab

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
CONTENT = HERE / "content"
GALATA = Path(jupyterlab.__file__).parent / "galata"

shutil.rmtree(CONTENT, ignore_errors=True)
shutil.copytree(ROOT / "_agents", CONTENT / "_agents")
subprocess.check_call(
    [
        sys.executable,
        "-m",
        "jupyter",
        "lite",
        "build",
        f"--FederatedExtensionAddon.extra_labextensions_path={GALATA}",
    ],
    cwd=HERE,
)
