#!/usr/bin/env python3
"""Shrink oversized photos in images/ (and assets/) for the web.
Run from the site folder after adding new pictures:
    python3 optimize-images.py
Needs Pillow once:  pip install Pillow
Rules: resize longest edge to 1600px max, re-save JPEG at quality 80.
Only overwrites a file when the result is smaller. PNGs are left as PNG."""
from PIL import Image
import io, os, sys

MAX_EDGE, QUALITY = 1600, 80
roots = ['images']
total_b = total_a = n = 0
for root in roots:
    if not os.path.isdir(root): continue
    for dirpath, _, files in os.walk(root):
        for fn in files:
            if not fn.lower().endswith(('.jpg', '.jpeg', '.png')): continue
            path = os.path.join(dirpath, fn)
            before = os.path.getsize(path)
            try: im = Image.open(path)
            except Exception as e:
                print(f"skip {path}: {e}"); continue
            fmt = 'PNG' if fn.lower().endswith('.png') else 'JPEG'
            if fmt == 'JPEG': im = im.convert('RGB')
            if max(im.size) > MAX_EDGE: im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, fmt, **({'quality': QUALITY, 'optimize': True, 'progressive': True} if fmt=='JPEG' else {'optimize': True}))
            if buf.tell() < before:
                open(path, 'wb').write(buf.getvalue())
                print(f"{path}: {before//1024} KB -> {buf.tell()//1024} KB")
            total_b += before; total_a += os.path.getsize(path); n += 1
print(f"\n{n} image(s) checked. {total_b/1e6:.2f} MB -> {total_a/1e6:.2f} MB")
