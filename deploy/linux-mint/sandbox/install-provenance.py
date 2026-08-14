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
            if name.startswith("."):
                dirnames.remove(name)
                continue
            child = directory_path / name
            relative = child.relative_to(broker_root).as_posix()
            if child.is_symlink() and not relative.startswith("lib/node_modules/npm/"):
                raise ContractError("unsupported_file_type")
        for name in filenames:
            if name.startswith("."):
                continue
            child = directory_path / name
            relative = child.relative_to(broker_root).as_posix()
            if relative == manifest_name:
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


def verify_installed_provenance(
    repo: Path,
    broker_root: Path,
    state_root: Path,
    systemd_root: Path,
    workspace_root: Path,
    manifest_path: Path,
    workspace_manifest_path: Path,
    source_commit: str,
    require_root: bool = False,
) -> None:
    if not COMMIT_RE.fullmatch(source_commit):
        raise ContractError("source_commit_invalid")
    if not manifest_path.exists():
        raise ContractError("install_manifest_missing")
    if not workspace_manifest_path.exists():
        raise ContractError("workspace_manifest_missing")
    if require_root:
        require_root_owned(manifest_path)
        require_root_owned(workspace_manifest_path)

    manifest_entries = parse_runtime_manifest(manifest_path, source_commit)
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

    workspace_entries = parse_workspace_manifest(workspace_manifest_path, source_commit)
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


def command_verify(args: argparse.Namespace) -> None:
    repo = Path(args.repo_root).resolve()
    broker_root = Path(args.broker_root).resolve()
    state_root = Path(args.state_root).resolve()
    systemd_root = Path(args.systemd_root).resolve()
    workspace_root = Path(args.workspace_root).resolve()
    manifest_path = Path(args.manifest)
    workspace_manifest_path = Path(args.workspace_manifest)
    verify_installed_provenance(
        repo=repo,
        broker_root=broker_root,
        state_root=state_root,
        systemd_root=systemd_root,
        workspace_root=workspace_root,
        manifest_path=manifest_path,
        workspace_manifest_path=workspace_manifest_path,
        source_commit=args.source_commit,
        require_root=getattr(args, "require_root_owned", False),
    )
    print("provenance_verified")


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                    v = v[1:-1]
                values[k] = v
    except OSError:
        return {}
    return values


def check_preactivation_readiness(
    repo: Path,
    conf_root: Path,
    state_root: Path,
    broker_root: Path,
    systemd_root: Path,
    source_pin: str,
    require_root: bool = False,
) -> dict[str, Any]:
    # 1. verify_source
    if not (repo / ".git").exists():
        return {"ok": False, "ready": False, "stage": "verify_source", "reason": "repo_unavailable"}
    try:
        current = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        return {"ok": False, "ready": False, "stage": "verify_source", "reason": "repo_unavailable"}
    if current != source_pin:
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_source",
            "reason": f"source_commit_mismatch:{current}",
        }

    # 2. verify_qualification_evidence
    evidence_base = state_root / "qualification" / "sandbox-isolation-02c"
    evidence_path = evidence_base / "runs" / source_pin / "evidence.json"
    canary_path = evidence_base / "runs" / source_pin / "canary-receipt.json"
    if not evidence_path.exists():
        evidence_path = evidence_base / "evidence.json"
    if not canary_path.exists():
        canary_path = evidence_base / "canary-receipt.json"

    if not evidence_path.exists() or not canary_path.exists():
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_qualification_evidence",
            "reason": "qualification_evidence_invalid:missing",
        }
    try:
        evidence_doc = load_json(evidence_path)
        canary_doc = load_json(canary_path)
    except ContractError as err:
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_qualification_evidence",
            "reason": f"qualification_evidence_invalid:unreadable:{err}",
        }

    if evidence_doc.get("status") != "qualified":
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_qualification_evidence",
            "reason": "qualification_evidence_invalid:status_not_qualified",
        }
    evidence = evidence_doc.get("evidence")
    if not isinstance(evidence, dict) or evidence.get("sourceCommit") != source_pin or evidence.get("providerKind") != "bubblewrap":
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_qualification_evidence",
            "reason": "qualification_evidence_invalid:evidence_payload",
        }
    if canary_doc.get("schema") != "bubblewrap-qualification-canary-v1" or canary_doc.get("status") != "pass" or canary_doc.get("sourceCommit") != source_pin:
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_qualification_evidence",
            "reason": "qualification_evidence_invalid:canary_receipt",
        }
    for field in ("evidenceId", "profileFingerprint", "providerBinaryDigest", "fixtureProbeManifestDigest"):
        if evidence.get(field) != canary_doc.get(field) or not evidence.get(field):
            return {
                "ok": False,
                "ready": False,
                "stage": "verify_qualification_evidence",
                "reason": f"qualification_evidence_invalid:field_mismatch:{field}",
            }

    # 3. verify_policy
    policy_path = conf_root / "keys" / "policy.json"
    policy_hash_path = conf_root / "keys" / "policy.json.sha256"
    if not policy_path.exists():
        return {"ok": False, "ready": False, "stage": "verify_policy", "reason": "policy_artifact_missing"}
    if not policy_hash_path.exists():
        return {"ok": False, "ready": False, "stage": "verify_policy", "reason": "policy_hash_missing"}
    try:
        policy_doc = load_json(policy_path)
    except ContractError:
        return {"ok": False, "ready": False, "stage": "verify_policy", "reason": "policy_artifact_unreadable"}
    expires_at = policy_doc.get("expiresAt")
    remaining = None
    if expires_at:
        try:
            from datetime import datetime, timezone
            expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            remaining = (expiry - datetime.now(timezone.utc)).total_seconds()
            if remaining < 30:
                return {"ok": False, "ready": False, "stage": "verify_policy", "reason": "policy_expired_or_expiring"}
        except (ValueError, TypeError):
            return {"ok": False, "ready": False, "stage": "verify_policy", "reason": "policy_expiry_invalid"}

    # 4. verify_protected_live_checkout
    try:
        status_out = subprocess.run(
            ["git", "-C", str(repo), "status", "--porcelain"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if status_out:
            return {"ok": False, "ready": False, "stage": "verify_protected_live_checkout", "reason": "live_checkout_dirty"}
    except subprocess.CalledProcessError:
        return {"ok": False, "ready": False, "stage": "verify_protected_live_checkout", "reason": "git_status_failed"}

    # 5. verify_source_bound_runtime
    manifest_path = broker_root / "install-manifest.json"
    workspace_manifest_path = state_root / "meta" / "engineering-workspace-manifest.json"
    workspace_root = state_root / "workspace" / "apps" / "agent-service"
    try:
        verify_installed_provenance(
            repo=repo,
            broker_root=broker_root,
            state_root=state_root,
            systemd_root=systemd_root,
            workspace_root=workspace_root,
            manifest_path=manifest_path,
            workspace_manifest_path=workspace_manifest_path,
            source_commit=source_pin,
            require_root=require_root,
        )
    except ContractError as error:
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_source_bound_runtime",
            "reason": f"provenance_mismatch:{error}",
        }

    # 6. verify_installed_artifacts
    broker_dist = broker_root / "dist" / "main.js"
    if not broker_dist.exists() or broker_dist.stat().st_size == 0:
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_installed_artifacts",
            "reason": "broker_dist_missing_or_empty",
        }
    try:
        km_proc = subprocess.run(
            ["systemctl", "show", "ashley-exec-broker.service", "-p", "KillMode", "--value"],
            capture_output=True,
            text=True,
            check=False,
        )
        if km_proc.returncode == 0:
            km = km_proc.stdout.strip()
            if km and km != "control-group":
                return {
                    "ok": False,
                    "ready": False,
                    "stage": "verify_installed_artifacts",
                    "reason": "kill_mode_not_control_group",
                }
    except Exception:
        pass

    # 7. verify_agent_configuration
    agent_env_path = conf_root / ".env"
    if not agent_env_path.exists():
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_agent_configuration",
            "reason": "agent_env_missing",
        }
    env_vars = parse_env_file(agent_env_path)
    for required in (
        "ASHLEY_SANDBOX_POLICY_ARTIFACT",
        "ASHLEY_SANDBOX_POLICY_SIGNATURE",
        "ASHLEY_SANDBOX_DELEGATED_ENABLED",
        "ASHLEY_SANDBOX_BROKER_SOCKET",
        "ASHLEY_SANDBOX_PROJECT_REGISTRY",
    ):
        if not env_vars.get(required):
            return {
                "ok": False,
                "ready": False,
                "stage": "verify_agent_configuration",
                "reason": f"agent_config_missing:{required}",
            }
    if env_vars.get("ASHLEY_SANDBOX_DELEGATED_ENABLED") != "true":
        return {
            "ok": False,
            "ready": False,
            "stage": "verify_agent_configuration",
            "reason": "agent_config_invalid:ASHLEY_SANDBOX_DELEGATED_ENABLED:expected_true",
        }

    keys_dir = Path(env_vars.get("ASHLEY_SANDBOX_KEYS_DIR", str(conf_root / "keys")))
    owner_key_id = env_vars.get("ASHLEY_SANDBOX_OWNER_KEY_ID", "owner-ed25519-v1")
    continuity_key_id = env_vars.get("ASHLEY_SANDBOX_CONTINUITY_KEY_ID", "continuity-tombstone-ed25519-v1")

    check_paths = [
        ("ASHLEY_SANDBOX_POLICY_ARTIFACT", Path(env_vars["ASHLEY_SANDBOX_POLICY_ARTIFACT"])),
        ("ASHLEY_SANDBOX_POLICY_SIGNATURE", Path(env_vars["ASHLEY_SANDBOX_POLICY_SIGNATURE"])),
        ("ASHLEY_SANDBOX_PROJECT_REGISTRY", Path(env_vars["ASHLEY_SANDBOX_PROJECT_REGISTRY"])),
        ("ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH", Path(env_vars.get("ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH", str(keys_dir / "master.pass")))),
        ("ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH", Path(env_vars.get("ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH", str(keys_dir / "owner-approval.key.enc")))),
        ("ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH", Path(env_vars.get("ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH", str(keys_dir / "continuity-tombstone.key.enc")))),
        ("ASHLEY_SANDBOX_OWNER_PUBLIC_KEY", Path(env_vars.get("ASHLEY_SANDBOX_OWNER_PUBLIC_KEY", str(keys_dir / f"{owner_key_id}.pub")))),
        ("ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY", Path(env_vars.get("ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY", str(keys_dir / f"{continuity_key_id}.pub")))),
        ("ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH", Path(env_vars.get("ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH", str(keys_dir / "delegated-runtime.key.enc")))),
    ]
    for label, p in check_paths:
        if not p.exists():
            return {
                "ok": False,
                "ready": False,
                "stage": "verify_agent_configuration",
                "reason": f"agent_config_path_missing:{label}:{p.as_posix()}",
            }

    return {
        "ok": True,
        "ready": True,
        "sourcePin": source_pin,
        "qualificationEvidenceId": evidence.get("evidenceId"),
        "policyId": policy_doc.get("policyId"),
        "policyExpiresAt": expires_at,
        "remainingSeconds": remaining,
    }


def command_verify_preactivation(args: argparse.Namespace) -> None:
    repo = Path(args.repo_root).resolve()
    conf_root = Path(args.conf_root).resolve()
    state_root = Path(args.state_root).resolve()
    broker_root = Path(args.broker_root).resolve()
    systemd_root = Path(args.systemd_root).resolve()
    result = check_preactivation_readiness(
        repo=repo,
        conf_root=conf_root,
        state_root=state_root,
        broker_root=broker_root,
        systemd_root=systemd_root,
        source_pin=args.source_pin,
        require_root=getattr(args, "require_root_owned", False),
    )
    print(json.dumps(result, indent=2))
    if not result.get("ready"):
        sys.exit(1)


def command_inspect_lifecycle(args: argparse.Namespace) -> None:
    repo = Path(args.repo_root).resolve()
    conf_root = Path(args.conf_root).resolve()
    state_root = Path(args.state_root).resolve()
    broker_root = Path(args.broker_root).resolve()
    systemd_root = Path(args.systemd_root).resolve()

    # Checkout
    checkout_source = None
    checkout_clean = False
    if (repo / ".git").exists():
        try:
            checkout_source = subprocess.run(
                ["git", "-C", str(repo), "rev-parse", "HEAD"],
                check=True, capture_output=True, text=True,
            ).stdout.strip()
            status_out = subprocess.run(
                ["git", "-C", str(repo), "status", "--porcelain"],
                check=True, capture_output=True, text=True,
            ).stdout.strip()
            checkout_clean = (len(status_out) == 0)
        except Exception:
            pass

    # Qualification
    qualified_source = None
    qualification_passed = False
    evidence_id = None
    if checkout_source:
        run_ev = state_root / "qualification" / "sandbox-isolation-02c" / "runs" / checkout_source / "evidence.json"
        if not run_ev.exists():
            run_ev = state_root / "qualification" / "sandbox-isolation-02c" / "evidence.json"
        if run_ev.exists():
            try:
                ev_doc = load_json(run_ev)
                if ev_doc.get("status") == "qualified" and ev_doc.get("evidence", {}).get("sourceCommit") == checkout_source:
                    qualified_source = checkout_source
                    qualification_passed = True
                    evidence_id = ev_doc.get("evidence", {}).get("evidenceId")
            except Exception:
                pass

    # Installed runtime
    installed_source = None
    installed_provenance_verified = False
    manifest_path = broker_root / "install-manifest.json"
    workspace_manifest_path = state_root / "meta" / "engineering-workspace-manifest.json"
    workspace_root = state_root / "workspace" / "apps" / "agent-service"
    if manifest_path.exists():
        try:
            m_doc = load_json(manifest_path)
            installed_source = m_doc.get("sourceCommit")
            if installed_source:
                verify_installed_provenance(
                    repo=repo,
                    broker_root=broker_root,
                    state_root=state_root,
                    systemd_root=systemd_root,
                    workspace_root=workspace_root,
                    manifest_path=manifest_path,
                    workspace_manifest_path=workspace_manifest_path,
                    source_commit=installed_source,
                    require_root=False,
                )
                installed_provenance_verified = True
        except Exception:
            installed_provenance_verified = False

    # Active source pin & marker
    active_source = None
    sandbox_autonomy = "DISABLED"
    marker_path = conf_root / "engineering-activation.json"
    if marker_path.exists():
        try:
            marker = load_json(marker_path)
            active_source = marker.get("sourcePin")
            sandbox_autonomy = marker.get("sandboxAutonomy", "DISABLED")
        except Exception:
            pass

    # Transaction
    tx_file = state_root / "meta" / "install-transaction.json"
    tx_state = None
    if tx_file.exists():
        try:
            tx_doc = load_json(tx_file)
            tx_state = tx_doc.get("state")
        except Exception:
            pass

    # Gates
    broker_env_path = Path("/etc/ashley-sandbox/broker.env")
    broker_env = parse_env_file(broker_env_path) if broker_env_path.exists() else {}
    agent_env = parse_env_file(conf_root / ".env")
    broker_gate = broker_env.get("ASHLEY_SANDBOX_BROKER_ENABLED") == "true" or agent_env.get("ASHLEY_SANDBOX_BROKER_ENABLED") == "true"
    delegated_gate = broker_env.get("ASHLEY_SANDBOX_DELEGATED_ENABLED") == "true" or agent_env.get("ASHLEY_SANDBOX_DELEGATED_ENABLED") == "true"

    # Policy
    policy_path = conf_root / "keys" / "policy.json"
    policy_id = None
    policy_fresh = False
    policy_expires_at = None
    if policy_path.exists():
        try:
            p_doc = load_json(policy_path)
            policy_id = p_doc.get("policyId")
            policy_expires_at = p_doc.get("expiresAt")
            if policy_expires_at:
                from datetime import datetime, timezone
                expiry = datetime.fromisoformat(policy_expires_at.replace("Z", "+00:00"))
                policy_fresh = (expiry - datetime.now(timezone.utc)).total_seconds() >= 30
        except Exception:
            pass

    # Pre-activation check if candidates align
    readiness_result = None
    blocking_reasons: list[str] = []
    if checkout_source and qualified_source == checkout_source and installed_source == checkout_source:
        readiness_result = check_preactivation_readiness(
            repo=repo,
            conf_root=conf_root,
            state_root=state_root,
            broker_root=broker_root,
            systemd_root=systemd_root,
            source_pin=checkout_source,
            require_root=False,
        )
        if not readiness_result.get("ready"):
            blocking_reasons.append(f"{readiness_result.get('stage')}:{readiness_result.get('reason')}")

    # Derive lifecycle state
    has_partial_dist = (broker_root / "dist").exists() and any((broker_root / "dist").iterdir()) if (broker_root / "dist").exists() else False
    if tx_state == "INSTALL_RECOVERY_REQUIRED" or tx_state == "COMMITTING" or (has_partial_dist and not manifest_path.exists()):
        lifecycle_state = "INSTALL_RECOVERY_REQUIRED"
        next_transition = "RECOVER_INSTALL"
        command = "sudo bash deploy/linux-mint/sandbox/install.sh --apply"
        explanation = "Interrupted or unmanifested candidate installation detected. Run install.sh --apply to converge runtime and publish authoritative manifests."
    elif sandbox_autonomy == "ENABLED" and active_source == checkout_source and installed_source == checkout_source and broker_gate and installed_provenance_verified:
        lifecycle_state = "ACTIVATED"
        next_transition = "DEACTIVATE"
        command = "bash scripts/mint/rollback-engineering.sh"
        explanation = "Host is actively running candidate. Execute owner-authorized deactivation to begin successor cycle."
    elif sandbox_autonomy != "ENABLED" and qualified_source != checkout_source:
        lifecycle_state = "DISABLED_UNQUALIFIED"
        if broker_gate:
            next_transition = "DEACTIVATE"
            command = "bash scripts/mint/rollback-engineering.sh"
            explanation = "Host has active broker gate. Deactivate host before running 02C qualification."
        else:
            next_transition = "QUALIFY"
            command = f"bash deploy/linux-mint/sandbox/qualification/run-02c.sh {checkout_source or '<COMMIT>'} {repo.as_posix()}"
            explanation = "Candidate checkout has not passed 02C physical qualification."
    elif qualified_source == checkout_source and qualification_passed and (installed_source != checkout_source or not installed_provenance_verified):
        lifecycle_state = "QUALIFIED_NOT_INSTALLED"
        next_transition = "INSTALL"
        command = "sudo bash deploy/linux-mint/sandbox/install.sh --apply"
        explanation = "Candidate has passed 02C qualification but runtime is not installed for this commit."
    elif qualified_source == checkout_source and installed_source == checkout_source and installed_provenance_verified and sandbox_autonomy != "ENABLED" and not policy_fresh:
        lifecycle_state = "POLICY_REFRESH_REQUIRED"
        next_transition = "ISSUE_POLICY"
        command = "node scripts/mint/issue-sandbox-policy.mjs --confirm-owner-issuance ..."
        explanation = "Runtime is installed and qualified, but policy is expired or missing. Owner must issue a fresh R4-005 policy."
    elif qualified_source == checkout_source and installed_source == checkout_source and installed_provenance_verified and sandbox_autonomy != "ENABLED" and policy_fresh:
        if readiness_result and readiness_result.get("ready"):
            lifecycle_state = "PRE_ACTIVATION_READY"
            next_transition = "ACTIVATE"
            command = f"bash scripts/mint/activate-engineering.sh {checkout_source}"
            explanation = "All pre-activation preconditions verified. Candidate is ready for owner-authorized activation."
        else:
            lifecycle_state = "INSTALLED_NOT_READY"
            next_transition = "FIX_CONFIGURATION"
            command = "(Address blocking reasons)"
            explanation = "Runtime is installed for candidate commit, but pre-activation verification failed."
    else:
        lifecycle_state = "UNKNOWN_INVALID_STATE"
        next_transition = "RECOVER"
        command = "bash scripts/mint/rollback-engineering.sh"
        explanation = "Host state is inconsistent or unreadable."

    output = {
        "checkoutSource": checkout_source,
        "checkoutClean": checkout_clean,
        "qualifiedSource": qualified_source,
        "qualificationPassed": qualification_passed,
        "installedSource": installed_source,
        "installedProvenanceVerified": installed_provenance_verified,
        "activeSource": active_source,
        "sandboxAutonomy": sandbox_autonomy,
        "brokerGate": broker_gate,
        "delegatedGate": delegated_gate,
        "policy": {
            "id": policy_id,
            "expiresAt": policy_expires_at,
            "fresh": policy_fresh,
        },
        "lifecycleState": lifecycle_state,
        "nextLegalTransition": next_transition,
        "transitionCommand": command,
        "explanation": explanation,
        "readiness": (readiness_result.get("ready") if readiness_result else False),
        "blockingReasons": blocking_reasons,
    }
    print(json.dumps(output, indent=2))


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

    preact = subcommands.add_parser("verify-preactivation")
    preact.add_argument("--repo-root", required=True)
    preact.add_argument("--conf-root", default=os.path.expanduser("~/.composer-assistant"))
    preact.add_argument("--state-root", default="/var/lib/ashley-sandbox")
    preact.add_argument("--broker-root", default="/opt/ashley-sandbox")
    preact.add_argument("--systemd-root", default="/etc/systemd/system")
    preact.add_argument("--source-pin", required=True)
    preact.add_argument("--require-root-owned", action="store_true")
    preact.set_defaults(handler=command_verify_preactivation)

    lifecycle = subcommands.add_parser("inspect-lifecycle")
    lifecycle.add_argument("--repo-root", required=True)
    lifecycle.add_argument("--conf-root", default=os.path.expanduser("~/.composer-assistant"))
    lifecycle.add_argument("--state-root", default="/var/lib/ashley-sandbox")
    lifecycle.add_argument("--broker-root", default="/opt/ashley-sandbox")
    lifecycle.add_argument("--systemd-root", default="/etc/systemd/system")
    lifecycle.set_defaults(handler=command_inspect_lifecycle)

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

