#!/usr/bin/env python3
"""Static server for site/ that supports HTTP Range requests.

Python's stock http.server ignores `Range`, so a browser cannot seek inside
the showreel and video scrubbing appears broken locally even though it works
on any real host. Use this for anything involving the video.

    python3 tools/serve.py [port]
"""
import os
import re
import sys
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            fh = open(path, "rb")
        except OSError:
            self.send_error(404)
            return None

        size = os.fstat(fh.fileno()).st_size
        m = RANGE_RE.match(rng.strip())
        if not m:
            fh.close()
            self.send_error(400)
            return None

        first, last = m.group(1), m.group(2)
        if first:
            start = int(first)
            end = int(last) if last else size - 1
        else:                                  # suffix form: bytes=-500
            start = max(0, size - int(last))
            end = size - 1
        end = min(end, size - 1)

        if start > end or start >= size:
            fh.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        fh.seek(start)
        self._remaining = end - start + 1
        return fh

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4321
    handler = partial(RangeHandler, directory=ROOT)
    print(f"serving {ROOT} on http://localhost:{port}  (Range enabled)")
    # Threaded: the grid asks for dozens of images at once, and a single
    # threaded server answers them one at a time until the browser gives up
    # and reports a connection timeout that looks like a broken asset.
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
