"""
Vercel serverless entry point for the FastAPI app.
Vercel detects `app` as the ASGI handler.
"""
import sys
import os
from pathlib import Path

# Ensure parent directory (where server.py lives) is on sys.path.
# In Vercel, files specified via vercel.json `includeFiles` are placed
# at the project root alongside the api/ folder inside /var/task.
_HERE = Path(__file__).resolve().parent
_PARENT = _HERE.parent
for _p in (_PARENT, _HERE):
    _p_str = str(_p)
    if _p_str not in sys.path:
        sys.path.insert(0, _p_str)

from server import app  # noqa: E402,F401

# Vercel's @vercel/python runtime looks for `app` (ASGI/WSGI handler).
