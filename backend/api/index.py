"""
Vercel FastAPI entrypoint. Must expose a top-level variable named `app`.
"""
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from server import app  # noqa: F401
