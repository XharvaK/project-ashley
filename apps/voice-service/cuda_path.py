"""Prepend NVIDIA pip wheel DLL dirs so ctranslate2 finds cublas on Windows."""
from __future__ import annotations

import os
import site
from pathlib import Path


def prepend_cuda_dll_paths() -> None:
    roots = []
    try:
        roots.extend(site.getsitepackages())
    except AttributeError:
        pass
    if site.USER_SITE:
        roots.append(site.USER_SITE)

    bins: list[str] = []
    for root in roots:
        nvidia = Path(root) / "nvidia"
        if not nvidia.is_dir():
            continue
        for child in nvidia.iterdir():
            bin_dir = child / "bin"
            if bin_dir.is_dir():
                bins.append(str(bin_dir))

    if not bins:
        return

    path = os.environ.get("PATH", "")
    os.environ["PATH"] = os.pathsep.join(bins) + (os.pathsep + path if path else "")


prepend_cuda_dll_paths()
