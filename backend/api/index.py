"""
Vercel serverless entry point for the FastAPI app.
Vercel detects `app` as the ASGI handler.
"""
import sys
import os
from pathlib import Path

# Add parent dir to path so we can import server.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import app  # noqa: E402,F401
