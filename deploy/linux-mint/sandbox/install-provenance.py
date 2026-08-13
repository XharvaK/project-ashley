#!/usr/bin/env python3
"""Source preflight and source-bound installed provenance for Ashley Sandbox."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable


RUNTIME_SCHEMA = "ashley-sandbox-install-manifest-v2"
WORKSPACE_SCHEMA = "ashley-engineering-workspace-manifest-v1"
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
COMPONENT_RE = re.compile(r"^[A-Za-z0-9@._+\-]+$")
ROOT_NAMES = {"broker", "state", "systemd"}
BUILD_RELEVANT_UNTRACKED_PREFIXES = (
    "apps/sandbox-broker/",
    "apps/sandbox-policy/",
    "apps/agent-service/",
)
BUILD_RELEVANT_UNTRACKED_FILES = (".npmrc", "package.json", "package-lock.json")


class ContractError(Exception):
    pass


def fail(reason: str) -> None:
    print(reason, file=sys.stderr)
    raise SystemExit(1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_relative_path(value: Any) -> str:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        raise ContractError("manifest_path_invalid")
    if value.startswith("/") or value.endswith("/"):
        raise ContractError("manifest_path_invalid")
    parts = value.split("/")
    if any(part in ("", ".", "..") or not COMPONENT_RE.fullmatch(part) for part in parts):
        raise ContractError("manifest_path_invalid")
    return value


def require_regular(path: Path) -> None:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError as error:
        raise ContractError("installed_set_mismatch") from error
    if not stat.S_ISREG(mode):
        raise ContractError("unsupported_file_type")


def walk_regular(root: Path, relative_prefix: str) -> list[str]:
    if not root.is_dir():
        raise ContractError("installed_set_mismatch")
    results: list[str] = []
    for directory, dirnames, filenames in os.walk(root, followlinks=False):
        directory_path = Path(directory)
        for name in list(dirnames):
            child = directory_path / name
            if child.is_symlink():
                raise ContractError("unsupported_file_type")
        for name in filenames:
            child = directory_path / name
            require_regular(child)
            relative = child.relative_to(root).as_posix()
            results.append(f"{relative_prefix}/{relative}")
    return sorted(results)


def expected_runtime_identities(repo: Path) -> list[tuple[str, str]]:
    identities: list[tuple[str, str]] = []
    for relative in walk_regular(repo / "apps/sandbox-broker/dist", "dist"):
        identities.append(("broker", relative))
    for relative in walk_regular(
        repo / "apps/sandbox-policy/dist",
        "node_modules/@composer-assistant/sandbox-policy/dist",
    ):
        identities.append(("broker", relative))
    identities.extend(
        [
            ("broker", "package.json"),
            (
                "broker",
                "node_modules/@composer-assistant/sandbox-policy/package.json",
            ),
            ("broker", "bin/peer-credentials"),
            ("broker", "bin/npm"),
            ("state", "meta/recipes.json"),
            ("systemd", "ashley-exec-broker.service"),
            ("systemd", "ashley-exec-broker.socket"),
        ]
    )
    for source in (
        repo / "apps/sandbox-broker/package.json",
        repo / "apps/sandbox-policy/package.json",
        repo / "deploy/linux-mint/sandbox/recipes.json",
    ):
        require_regular(source)
    return sorted(identities)


def identity_path(
    identity: tuple[str, str], broker_root: Path, state_root: Path, systemd_root: Path
) -> Path:
    root_name, relative = identity
    roots = {"broker": broker_root, "state": state_root, "systemd": systemd_root}
    root = roots[root_name]
    if root.is_symlink() or not root.is_dir():
        raise ContractError("unsupported_file_type")
    candidate = root
    components = relative.split("/")
    for index, component in enumerate(components):
        candidate = candidate / component
        try:
            mode = candidate.lstat().st_mode
        except FileNotFoundError as error:
            raise ContractError("installed_set_mismatch") from error
        if stat.S_ISLNK(mode):
            raise ContractError("unsupported_file_type")
        if index < len(components) - 1 and not stat.S_ISDIR(mode):
            raise ContractError("unsupported_file_type")
    return candidate


def installed_runtime_identities(
    broker_root: Path, state_root: Path, systemd_root: Path
) -> list[tuple[str, str]]:
    identities: list[tuple[str, str]] = []
    for relative in walk_regular(broker_root / "dist", "dist"):
        identities.append(("broker", relative))
    for relative in walk_regular(
        broker_root / "node_modules/@composer-assistant/sandbox-policy/dist",
        "node_modules/@composer-assistant/sandbox-policy/dist",
    ):
        identities.append(("broker", relative))
    identities.extend(
        [
            ("broker", "package.json"),
            (
                "broker",
                "node_modules/@composer-assistant/sandbox-policy/package.json",
            ),
            ("broker", "bin/peer-credentials"),
            ("broker", "bin/npm"),
            ("state", "meta/recipes.json"),
            ("systemd", "ashley-exec-broker.service"),
            ("systemd", "ashley-exec-broker.socket"),
        ]
    )
    for identity in identities:
        require_regular(identity_path(identity, broker_root, state_root, systemd_root))

    expected_units = {"ashley-exec-broker.service", "ashley-exec-broker.socket"}
    installed_units = {
        child.name
        for child in systemd_root.glob("ashley-exec-broker.*")
        if child.is_file() or child.is_symlink()
    }
    if installed_units != expected_units:
        raise ContractError("installed_set_mismatch")

    known = set(identities)
    manifest_name = "install-manifest.json"
    for directory, dirnames, filenames in os.walk(broker_root, followlinks=False):
        directory_path = Path(directory)
        for name in list(dirnames):
            child = directory_path / name
            relative = child.relative_to(broker_root).as_posix()
            if child.is_symlink() and not relative.startswith("lib/node_modules/npm/"):
                raise ContractError("unsupported_file_type")
        for name in filenames:
            child = directory_path / name
            relative = child.relative_to(broker_root).as_posix()
            if relative == manifest_name or relative.startswith(f".{manifest_name}."):
                continue
            if relative == "bin/node" or relative.startswith("lib/node_modules/npm/"):
                continue
            if ("broker", relative) not in known:
                identities.append(("broker", relative))
    return sorted(set(identities))


def runtime_artifacts(
    repo: Path, broker_root: Path, state_root: Path, systemd_root: Path
) -> list[dict[str, str]]:
    expected = expected_runtime_identities(repo)
    installed = installed_runtime_identities(broker_root, state_root, systemd_root)
    if installed != expected:
        raise ContractError("installed_set_mismatch")
    return [
        {
            "root": root_name,
            "path": relative,
            "sha256": sha256_file(identity_path(identity, broker_root, state_root, systemd_root)),
        }
        for identity in expected
        for root_name, relative in [identity]
    ]


def safe_symlink_target(root: Path, link: Path, target: str) -> bool:
    if not target or "\x00" in target or "\\" in target or os.path.isabs(target):
        return False
    resolved = (link.parent / target).resolve(strict=False)
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        return False
    return True


def workspace_artifacts(workspace_root: Path) -> list[dict[str, str]]:
    if not workspace_root.is_dir():
        raise ContractError("workspace_missing")
    artifacts: list[dict[str, str]] = []
    for directory, dirnames, filenames in os.walk(workspace_root, followlinks=False):
        directory_path = Path(directory)
        for name in list(dirnames):
            child = directory_path / name
            if child.is_symlink():
                target = os.readlink(child)
                if not safe_symlink_target(workspace_root, child, target):
                    raise ContractError("workspace_symlink_invalid")
                artifacts.append(
                    {
                        "path": child.relative_to(workspace_root).as_posix(),
                        "type": "symlink",
                        "target": target,
                    }
                )
                dirnames.remove(name)
        for name in filenames:
            child = directory_path / name
            relative = child.relative_to(workspace_root).as_posix()
            mode = child.lstat().st_mode
            if stat.S_ISREG(mode):
                artifacts.append(
                    {"path": relative, "type": "file", "sha256": sha256_file(child)}
                )
            elif stat.S_ISLNK(mode):
                target = os.readlink(child)
                if not safe_symlink_target(workspace_root, child, target):
                    raise ContractError("workspace_symlink_invalid")
                artifacts.append({"path": relative, "type": "symlink", "target": target})
            else:
                raise ContractError("unsupported_file_type")
    return sorted(artifacts, key=lambda entry: entry["path"])


def maybe_fail(selected: str | None, stage: str) -> None:
    if selected == stage:
        raise ContractError(f"injected_failure:{stage}")


def atomic_json(path: Path, payload: dict[str, Any], mode: int, fail_at: str | None, prefix: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        maybe_fail(fail_at, f"during_{prefix}_temp_creation")
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2, sort_keys=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            os.chown(temporary, 0, 0)
        maybe_fail(fail_at, f"after_{prefix}_temp")
        maybe_fail(fail_at, f"before_{prefix}_rename")
        if os.name == "nt" and path.exists():
            os.chmod(path, stat.S_IWRITE)
        os.replace(temporary, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
        maybe_fail(fail_at, f"after_{prefix}_rename")
    finally:
        if temporary.exists():
            if os.name == "nt":
                os.chmod(temporary, stat.S_IWRITE)
            temporary.unlink()


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError("manifest_unreadable") from error
    if not isinstance(value, dict):
        raise ContractError("manifest_shape_invalid")
    return value


def parse_runtime_manifest(path: Path, source_commit: str) -> list[dict[str, str]]:
    manifest = load_json(path)
    if set(manifest) != {"schema", "subject", "sourceCommit", "artifacts"}:
        raise ContractError("manifest_shape_invalid")
    if manifest.get("schema") != RUNTIME_SCHEMA or manifest.get("subject") != "broker-runtime":
        raise ContractError("manifest_schema_invalid")
    if manifest.get("sourceCommit") != source_commit:
        raise ContractError("source_commit_mismatch")
    raw = manifest.get("artifacts")
    if not isinstance(raw, list):
        raise ContractError("manifest_shape_invalid")
    parsed: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for entry in raw:
        if not isinstance(entry, dict) or set(entry) != {"root", "path", "sha256"}:
            raise ContractError("manifest_shape_invalid")
        root_name = entry.get("root")
        if root_name not in ROOT_NAMES:
            raise ContractError("manifest_root_invalid")
        relative = validate_relative_path(entry.get("path"))
        digest = entry.get("sha256")
        if not isinstance(digest, str) or not HASH_RE.fullmatch(digest):
            raise ContractError("manifest_digest_invalid")
        identity = (root_name, relative)
        if identity in seen:
            raise ContractError("manifest_duplicate_artifact")
        seen.add(identity)
        parsed.append({"root": root_name, "path": relative, "sha256": digest})
    return parsed


def parse_workspace_manifest(path: Path, source_commit: str) -> list[dict[str, str]]:
    manifest = load_json(path)
    if set(manifest) != {"schema", "subject", "sourceCommit", "artifacts"}:
        raise ContractError("workspace_manifest_shape_invalid")
    if manifest.get("schema") != WORKSPACE_SCHEMA or manifest.get("subject") != "engineering-workspace":
        raise ContractError("workspace_manifest_schema_invalid")
    if manifest.get("sourceCommit") != source_commit:
        raise ContractError("workspace_source_commit_mismatch")
    raw = manifest.get("artifacts")
    if not isinstance(raw, list):
        raise ContractError("workspace_manifest_shape_invalid")
    parsed: list[dict[str, str]] = []
    seen: set[str] = set()
    for entry in raw:
        if not isinstance(entry, dict):
            raise ContractError("workspace_manifest_shape_invalid")
        relative = validate_relative_path(entry.get("path"))
        if relative in seen:
            raise ContractError("workspace_manifest_duplicate_artifact")
        seen.add(relative)
        entry_type = entry.get("type")
        if entry_type == "file" and set(entry) == {"path", "type", "sha256"}:
            digest = entry.get("sha256")
            if not isinstance(digest, str) or not HASH_RE.fullmatch(digest):
                raise ContractError("workspace_manifest_digest_invalid")
            parsed.append({"path": relative, "type": "file", "sha256": digest})
        elif entry_type == "symlink" and set(entry) == {"path", "type", "target"}:
            target = entry.get("target")
            if not isinstance(target, str):
                raise ContractError("workspace_manifest_shape_invalid")
            parsed.append({"path": relative, "type": "symlink", "target": target})
        else:
            raise ContractError("workspace_manifest_shape_invalid")
    return parsed


def require_root_owned(path: Path) -> None:
    # Root ownership is a Linux release property. Windows scratch fixtures do
    # not expose a meaningful Unix uid or permission model.
    if os.name == "nt":
        return
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o022:
        raise ContractError("manifest_privilege_invalid")


def command_source_preflight(args: argparse.Namespace) -> None:
    repo = Path(args.repo_root).resolve()
    if not (repo / ".git").exists():
        raise ContractError("source_not_git_checkout")
    dirty = subprocess.run(
        ["git", "-C", str(repo), "diff", "--quiet", "HEAD", "--"],
        check=False,
    )
    if dirty.returncode != 0:
        raise ContractError("tracked_source_dirty")
    untracked = subprocess.run(
        ["git", "-C", str(repo), "ls-files", "--others", "--exclude-standard"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    for relative in untracked:
        canonical = relative.replace("\\", "/")
        if canonical in BUILD_RELEVANT_UNTRACKED_FILES or canonical.startswith(
            BUILD_RELEVANT_UNTRACKED_PREFIXES
        ):
            raise ContractError(f"untracked_build_input:{canonical}")
    print("source_preflight_passed")


def command_publish(args: argparse.Namespace) -> None:
    if not COMMIT_RE.fullmatch(args.source_commit):
        raise ContractError("source_commit_invalid")
    repo = Path(args.repo_root).resolve()
    broker_root = Path(args.broker_root).resolve()
    state_root = Path(args.state_root).resolve()
    systemd_root = Path(args.systemd_root).resolve()
    workspace_root = Path(args.workspace_root).resolve()
    maybe_fail(args.fail_at, "during_hashing")
    runtime = {
        "schema": RUNTIME_SCHEMA,
        "subject": "broker-runtime",
        "sourceCommit": args.source_commit,
        "artifacts": runtime_artifacts(repo, broker_root, state_root, systemd_root),
    }
    workspace = {
        "schema": WORKSPACE_SCHEMA,
        "subject": "engineering-workspace",
        "sourceCommit": args.source_commit,
        "artifacts": workspace_artifacts(workspace_root),
    }
    atomic_json(Path(args.manifest), runtime, 0o644, args.fail_at, "runtime")
    atomic_json(
        Path(args.workspace_manifest),
        workspace,
        0o440,
        args.fail_at,
        "workspace",
    )
    print("manifest_published")


def command_verify(args: argparse.Namespace) -> None:
    if not COMMIT_RE.fullmatch(args.source_commit):
        raise ContractError("source_commit_invalid")
    repo = Path(args.repo_root).resolve()
    broker_root = Path(args.broker_root).resolve()
    state_root = Path(args.state_root).resolve()
    systemd_root = Path(args.systemd_root).resolve()
    workspace_root = Path(args.workspace_root).resolve()
    manifest_path = Path(args.manifest)
    workspace_manifest_path = Path(args.workspace_manifest)
    if args.require_root_owned:
        require_root_owned(manifest_path)
        require_root_owned(workspace_manifest_path)

    manifest_entries = parse_runtime_manifest(manifest_path, args.source_commit)
    expected = expected_runtime_identities(repo)
    manifest_identities = [(entry["root"], entry["path"]) for entry in manifest_entries]
    if sorted(manifest_identities) != expected:
        raise ContractError("artifact_set_mismatch")
    for identity in expected:
        require_regular(identity_path(identity, broker_root, state_root, systemd_root))
    installed = installed_runtime_identities(broker_root, state_root, systemd_root)
    if installed != expected:
        raise ContractError("installed_set_mismatch")
    for entry in manifest_entries:
        identity = (entry["root"], entry["path"])
        target = identity_path(identity, broker_root, state_root, systemd_root)
        require_regular(target)
        if sha256_file(target) != entry["sha256"]:
            raise ContractError("digest_mismatch")

    workspace_entries = parse_workspace_manifest(
        workspace_manifest_path, args.source_commit
    )
    actual_workspace = workspace_artifacts(workspace_root)
    expected_workspace = sorted(workspace_entries, key=lambda entry: entry["path"])
    if [entry["path"] for entry in actual_workspace] != [
        entry["path"] for entry in expected_workspace
    ]:
        raise ContractError("workspace_artifact_set_mismatch")
    for actual, expected_entry in zip(actual_workspace, expected_workspace):
        if actual.get("type") != expected_entry.get("type"):
            raise ContractError("workspace_type_mismatch")
        if actual.get("type") == "file" and actual.get("sha256") != expected_entry.get("sha256"):
            raise ContractError("workspace_digest_mismatch")
        if actual.get("type") == "symlink" and actual.get("target") != expected_entry.get("target"):
            raise ContractError("workspace_symlink_mismatch")
    print("provenance_verified")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    subcommands = result.add_subparsers(dest="command", required=True)
    source = subcommands.add_parser("source-preflight")
    source.add_argument("--repo-root", required=True)
    source.set_defaults(handler=command_source_preflight)
    for name, handler in (("publish", command_publish), ("verify", command_verify)):
        command = subcommands.add_parser(name)
        command.add_argument("--repo-root", required=True)
        command.add_argument("--broker-root", required=True)
        command.add_argument("--state-root", required=True)
        command.add_argument("--systemd-root", required=True)
        command.add_argument("--workspace-root", required=True)
        command.add_argument("--manifest", required=True)
        command.add_argument("--workspace-manifest", required=True)
        command.add_argument("--source-commit", required=True)
        command.add_argument("--fail-at")
        command.add_argument("--require-root-owned", action="store_true")
        command.set_defaults(handler=handler)
    return result


def main() -> None:
    args = parser().parse_args()
    try:
        args.handler(args)
    except ContractError as error:
        fail(str(error))
    except subprocess.CalledProcessError:
        fail("source_preflight_command_failed")


if __name__ == "__main__":
    main()
