from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Iterable, List, NamedTuple, Tuple

try:
    from hatchling.builders.hooks.plugin.interface import BuildHookInterface
except Exception:  # pragma: no cover
    BuildHookInterface = None

ENTRYPOINT_FILENAMES = ("index.ts", "index.tsx", "index.js", "index.jsx")
README_FILENAME = "README.md"
RAW_GITHUB_EXTENSION_EXAMPLES_REPOSITORY_URL = (
    "https://raw.githubusercontent.com/jupyterlab/extension-examples"
)
DEFAULT_EXTENSION_EXAMPLES_REF = "main"
REMOTE_MEDIA_EXTENSIONS = (".gif", ".png", ".mp4", ".mov", ".webm")
LOCKFILE_FILENAMES = {
    "yarn.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "npm-shrinkwrap.json",
    "Pipfile.lock",
    "poetry.lock",
}
SKIPPED_DIRECTORY_NAMES = {
    "ui-tests",
    "node_modules",
    "lib",
    "dist",
    "__pycache__",
    ".ipynb_checkpoints",
}
SKIPPED_FILE_PREFIXES = ("playwright.config.",)
SKIPPED_FILE_SUFFIXES = (".gif", ".png", ".mp4", ".mov", ".webm", ".pyc", ".pyo")
MARKDOWN_LINK_TARGET_PATTERN = re.compile(r"\]\((?P<target>[^)\s]+)\)")
MARKDOWN_REFERENCE_TARGET_PATTERN = re.compile(
    r"(?m)^(?P<prefix>\[[^\]]+\]:\s*)(?P<target>\S+)"
)
HTML_SOURCE_TARGET_PATTERN = re.compile(
    r"""(?P<prefix>\bsrc=["'])(?P<target>[^"']+)(?P<suffix>["'])""",
    re.IGNORECASE,
)
MARKDOWN_EMPHASIZED_TARGET_PATTERN = re.compile(r"_(?P<target>[^\s_]+\.[A-Za-z0-9]+)_")


class SyncStats(NamedTuple):
    source_root: Path
    destination_root: Path
    copied_examples: int
    copied_files: int
    copied_bytes: int


def ensure_extension_examples_source(root: Path) -> Path:
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
        except subprocess.CalledProcessError as error:
            raise RuntimeError(
                "Failed to initialize the 'extension-examples' submodule."
            ) from error
        except OSError as error:
            raise RuntimeError(
                "Failed to initialize the 'extension-examples' submodule: "
                "'git' is required when building from a git checkout."
            ) from error

        if (examples / "README.md").exists():
            return examples

        raise RuntimeError(
            "Submodule update completed but 'extension-examples' was not found."
        )

    raise RuntimeError(
        "Missing 'extension-examples'. Build from a git checkout with submodules "
        "initialized."
    )


def has_example_entrypoint(example_dir: Path) -> bool:
    src_dir = example_dir / "src"
    return any((src_dir / filename).exists() for filename in ENTRYPOINT_FILENAMES)


def list_example_directories(source_root: Path) -> List[Path]:
    examples: List[Path] = []
    for child in sorted(source_root.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if has_example_entrypoint(child):
            examples.append(child)
    return examples


def sync_extension_examples(source_root: Path, destination_root: Path) -> SyncStats:
    source_root = source_root.resolve()
    destination_root = destination_root.resolve()
    raw_base_url = _raw_github_extension_examples_base_url(source_root)

    if destination_root.exists():
        shutil.rmtree(destination_root)
    destination_root.mkdir(parents=True, exist_ok=True)

    copied_examples = 0
    copied_files = 0
    copied_bytes = 0

    for example_dir in list_example_directories(source_root):
        copied_examples += 1
        for current_dir, dirnames, filenames in os.walk(example_dir):
            current_path = Path(current_dir)
            relative_dir = current_path.relative_to(source_root)

            keep_dirs = []
            for dirname in sorted(dirnames):
                relative_path = relative_dir / dirname
                if _should_skip(relative_path, is_dir=True):
                    continue
                keep_dirs.append(dirname)
            dirnames[:] = keep_dirs

            for filename in sorted(filenames):
                relative_path = relative_dir / filename
                if _should_skip(relative_path, is_dir=False):
                    continue

                source_file = current_path / filename
                destination_file = destination_root / relative_path
                destination_file.parent.mkdir(parents=True, exist_ok=True)
                if filename.lower() == README_FILENAME.lower():
                    _copy_readme_with_remote_media(
                        source_file=source_file,
                        destination_file=destination_file,
                        source_root=source_root,
                        raw_base_url=raw_base_url,
                    )
                else:
                    shutil.copy2(source_file, destination_file)
                copied_files += 1
                copied_bytes += destination_file.stat().st_size

    return SyncStats(
        source_root=source_root,
        destination_root=destination_root,
        copied_examples=copied_examples,
        copied_files=copied_files,
        copied_bytes=copied_bytes,
    )


def directory_file_stats(root: Path) -> Tuple[int, int]:
    file_count = 0
    total_bytes = 0
    for file_path in iter_files(root):
        file_count += 1
        total_bytes += file_path.stat().st_size
    return file_count, total_bytes


def iter_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def _should_skip(relative_path: Path, *, is_dir: bool) -> bool:
    if _is_hidden_path(relative_path):
        return True

    parts = relative_path.parts
    if not parts:
        return False

    directory_parts = parts if is_dir else parts[:-1]
    if any(part in SKIPPED_DIRECTORY_NAMES for part in directory_parts):
        return True

    name = parts[-1]
    if is_dir:
        return name in SKIPPED_DIRECTORY_NAMES

    if name in LOCKFILE_FILENAMES:
        return True
    if any(name.startswith(prefix) for prefix in SKIPPED_FILE_PREFIXES):
        return True
    if name.lower().endswith(SKIPPED_FILE_SUFFIXES):
        return True
    return False


def _is_hidden_path(relative_path: Path) -> bool:
    return any(part.startswith(".") for part in relative_path.parts)


def _copy_readme_with_remote_media(
    *,
    source_file: Path,
    destination_file: Path,
    source_root: Path,
    raw_base_url: str,
) -> None:
    content = source_file.read_text(encoding="utf-8")
    readme_relative_dir = source_file.parent.relative_to(source_root)
    rewritten = _rewrite_readme_media_references(
        content,
        readme_relative_dir,
        raw_base_url=raw_base_url,
    )
    destination_file.write_text(rewritten, encoding="utf-8")


def _rewrite_readme_media_references(
    content: str, readme_relative_dir: Path, *, raw_base_url: str
) -> str:
    def replace_markdown_target(match: re.Match[str]) -> str:
        target = match.group("target")
        rewritten = _build_remote_media_url(
            target,
            readme_relative_dir,
            raw_base_url=raw_base_url,
        )
        if rewritten is None:
            return match.group(0)
        return match.group(0).replace(target, rewritten, 1)

    def replace_html_source(match: re.Match[str]) -> str:
        target = match.group("target")
        rewritten = _build_remote_media_url(
            target,
            readme_relative_dir,
            raw_base_url=raw_base_url,
        )
        if rewritten is None:
            return match.group(0)
        return f"{match.group('prefix')}{rewritten}{match.group('suffix')}"

    def replace_emphasized_target(match: re.Match[str]) -> str:
        target = match.group("target")
        rewritten = _build_remote_media_url(
            target,
            readme_relative_dir,
            raw_base_url=raw_base_url,
        )
        if rewritten is None:
            return match.group(0)
        return f"[{target}]({rewritten})"

    content = MARKDOWN_LINK_TARGET_PATTERN.sub(replace_markdown_target, content)
    content = MARKDOWN_REFERENCE_TARGET_PATTERN.sub(replace_markdown_target, content)
    content = HTML_SOURCE_TARGET_PATTERN.sub(replace_html_source, content)
    content = MARKDOWN_EMPHASIZED_TARGET_PATTERN.sub(replace_emphasized_target, content)
    return content


def _build_remote_media_url(
    target: str, readme_relative_dir: Path, *, raw_base_url: str
) -> str | None:
    path_part, suffix = _split_target_suffix(target)
    if _looks_external(path_part) or not path_part.lower().endswith(
        REMOTE_MEDIA_EXTENSIONS
    ):
        return None

    normalized = _normalize_repo_relative_path(path_part, readme_relative_dir)
    if normalized is None:
        return None

    return f"{raw_base_url}/{normalized}{suffix}"


def _raw_github_extension_examples_base_url(source_root: Path) -> str:
    ref = _resolve_extension_examples_ref(source_root)
    return f"{RAW_GITHUB_EXTENSION_EXAMPLES_REPOSITORY_URL}/{ref}"


def _resolve_extension_examples_ref(source_root: Path) -> str:
    try:
        ref = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=str(source_root),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, OSError):
        return DEFAULT_EXTENSION_EXAMPLES_REF

    if re.fullmatch(r"[0-9a-fA-F]{40}", ref):
        return ref.lower()
    return DEFAULT_EXTENSION_EXAMPLES_REF


def _split_target_suffix(target: str) -> Tuple[str, str]:
    split_index = -1
    for separator in ("?", "#"):
        index = target.find(separator)
        if index == -1:
            continue
        if split_index == -1 or index < split_index:
            split_index = index
    if split_index != -1:
        return target[:split_index], target[split_index:]
    return target, ""


def _looks_external(path: str) -> bool:
    lowered = path.lower()
    return (
        "://" in lowered
        or lowered.startswith("data:")
        or lowered.startswith("mailto:")
        or lowered.startswith("#")
    )


def _normalize_repo_relative_path(path: str, readme_relative_dir: Path) -> str | None:
    if path.startswith("/"):
        combined_parts = Path(path.lstrip("/")).parts
    else:
        combined_parts = (readme_relative_dir / Path(path)).parts

    normalized_parts: List[str] = []
    for part in combined_parts:
        if part in ("", "."):
            continue
        if part == "..":
            if not normalized_parts:
                return None
            normalized_parts.pop()
            continue
        normalized_parts.append(part)

    if not normalized_parts:
        return None
    return "/".join(normalized_parts)


if BuildHookInterface is not None:

    class ExtensionExamplesBuildHook(BuildHookInterface):
        PLUGIN_NAME = "extension_examples"

        def initialize(self, version: str, build_data: dict) -> None:
            root = Path(self.root).resolve()
            destination = root / "jupyterlab_plugin_playground" / "extension-examples"

            source = root / "extension-examples"
            if source.is_dir():
                source = ensure_extension_examples_source(root)
                stats = sync_extension_examples(source, destination)
                print(
                    "Prepared trimmed extension examples for build: "
                    f"{stats.copied_examples} examples, "
                    f"{stats.copied_files} files."
                )
                return

            if destination.is_dir():
                print(
                    "Using existing trimmed extension examples from source tree at "
                    f"{destination}."
                )
                return

            raise RuntimeError(
                "Missing 'extension-examples'. Build from a git checkout with "
                "submodules initialized."
            )


def get_build_hook():
    if BuildHookInterface is None:
        raise RuntimeError("Build hook requested but hatchling is unavailable.")
    return ExtensionExamplesBuildHook
