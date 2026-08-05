"""Every `from server import X` must name something server.py actually exports.

server.py is the god module being progressively split into routers and services.
When a symbol moves out, module-level importers fail loudly at boot — but an
import inside a function body only raises when that code path runs, and if the
caller swallows exceptions the breakage is silent.

That is exactly how `send_push_notification` broke: it moved to
notification_service.py, three deferred `from server import` sites were missed,
and every trip completion, trip cancellation and FCM offer fallback silently
stopped sending push notifications while the completion saga retried forever.
"""
from __future__ import annotations

import ast
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {"__pycache__", "node_modules", ".venv", "venv", "proto"}


def _python_files() -> list[pathlib.Path]:
    return [
        p
        for p in BACKEND.rglob("*.py")
        if not any(part in SKIP_DIRS for part in p.parts)
    ]


def _module_level_names(path: pathlib.Path) -> set[str]:
    """Top-level names bound in a module, without importing it."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
    return names


def _server_imports() -> list[tuple[pathlib.Path, int, str]]:
    """Every `from server import X`, wherever it appears (including in functions)."""
    found: list[tuple[pathlib.Path, int, str]] = []
    for path in _python_files():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "server":
                for alias in node.names:
                    found.append((path, node.lineno, alias.name))
    return found


def test_every_symbol_imported_from_server_exists():
    exported = _module_level_names(BACKEND / "server.py")
    broken = [
        f"{path.relative_to(BACKEND)}:{lineno} imports '{name}' from server, "
        f"but server.py does not define it"
        for path, lineno, name in _server_imports()
        if name != "*" and name not in exported
    ]
    assert not broken, "Dangling imports from server.py:\n  " + "\n  ".join(broken)
