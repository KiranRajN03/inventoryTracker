#!/usr/bin/env python3
"""Convert APPLICATION_WALKTHROUGH.md → self-contained HTML with embedded base64 images."""
import base64
import re
import sys
from pathlib import Path

try:
    from markdown_it import MarkdownIt
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "markdown-it-py"])
    from markdown_it import MarkdownIt

DOCS = Path("/app/docs")
md_text = (DOCS / "APPLICATION_WALKTHROUGH.md").read_text()

# Embed images as base64 data URIs
def embed_image(match):
    alt, path = match.group(1), match.group(2)
    img_path = DOCS / path
    if not img_path.exists():
        return match.group(0)
    b64 = base64.b64encode(img_path.read_bytes()).decode("ascii")
    mime = "image/jpeg" if img_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"![{alt}](data:{mime};base64,{b64})"

md_text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", embed_image, md_text)

md = MarkdownIt("commonmark", {"html": True, "linkify": True, "typographer": True}).enable("table").enable("strikethrough")
body = md.render(md_text)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Inventory Management Platform — Walkthrough</title>
<style>
  body {{
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 980px;
    margin: 40px auto;
    padding: 0 24px;
    color: #0a0a0a;
    line-height: 1.6;
    background: #f4f4f6;
  }}
  h1, h2, h3, h4 {{
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin-top: 2.2em;
    margin-bottom: 0.6em;
  }}
  h1 {{ font-size: 2.4rem; border-bottom: 2px solid #0a0a0a; padding-bottom: 12px; margin-top: 0; }}
  h2 {{ font-size: 1.8rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }}
  h3 {{ font-size: 1.3rem; }}
  h4 {{ font-size: 1.1rem; color: #525252; }}
  a {{ color: #002FA7; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  code {{
    font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
    background: #e5e5e5;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
  }}
  pre {{
    background: #0a0a0a;
    color: #f4f4f6;
    padding: 16px;
    border-radius: 4px;
    overflow-x: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
  }}
  pre code {{ background: none; padding: 0; color: inherit; }}
  blockquote {{
    border-left: 4px solid #002FA7;
    background: #ffffff;
    padding: 12px 20px;
    margin: 16px 0;
    color: #525252;
  }}
  blockquote p {{ margin: 6px 0; }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 20px 0;
    background: #ffffff;
    border: 1px solid #e5e5e5;
  }}
  th, td {{
    text-align: left;
    padding: 10px 14px;
    border-bottom: 1px solid #e5e5e5;
    font-size: 0.93rem;
  }}
  th {{
    background: #f4f4f6;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.78rem;
    letter-spacing: 0.05em;
    color: #525252;
  }}
  tr:last-child td {{ border-bottom: none; }}
  img {{
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border: 1px solid #e5e5e5;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    border-radius: 4px;
  }}
  hr {{
    border: none;
    border-top: 1px solid #e5e5e5;
    margin: 40px 0;
  }}
  ul, ol {{ padding-left: 24px; }}
  li {{ margin: 6px 0; }}
  strong {{ font-weight: 700; }}
  @media print {{
    body {{ background: #ffffff; margin: 0; padding: 16px; max-width: 100%; }}
    img {{ box-shadow: none; max-width: 90%; page-break-inside: avoid; }}
    h2, h3 {{ page-break-after: avoid; }}
    table {{ page-break-inside: avoid; }}
  }}
</style>
</head>
<body>
{body}
</body>
</html>
"""

out_path = DOCS / "APPLICATION_WALKTHROUGH.html"
out_path.write_text(html)
print(f"✅ Generated {out_path} ({len(html) // 1024} KB)")
