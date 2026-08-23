#!/usr/bin/env python3
"""Full-page and per-section screenshots of the running site, over CDP.

  python3 tools/shoot.py OUT.png [--w 1440] [--h 900] [--full] [--sel '#work']
                                 [--reduced] [--click SELECTOR]

Chrome's --screenshot flag only captures the viewport, and the layout uses
`svh` units, so a tall window distorts it. Driving DevTools directly lets us
keep a real viewport and still capture the whole page.
"""
import argparse
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Chrome:
    def __init__(self, width, height, reduced=False):
        self.port = free_port()
        self.profile = tempfile.mkdtemp()
        args = [
            CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1", "--mute-audio",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={self.port}",
            f"--user-data-dir={self.profile}",
            f"--window-size={width},{height}",
            "about:blank",
        ]
        if reduced:
            args.insert(2, "--force-prefers-reduced-motion")
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        last = None
        for _ in range(100):
            try:
                data = urllib.request.urlopen(
                    f"http://127.0.0.1:{self.port}/json/list", timeout=1).read()
                tabs = [t for t in json.loads(data) if t["type"] == "page"]
                if tabs:
                    self.ws = websocket.create_connection(
                        tabs[0]["webSocketDebuggerUrl"], timeout=90)
                    self.mid = 0
                    return
            except Exception as exc:
                last = exc
                time.sleep(.15)
        raise RuntimeError(f"could not attach to Chrome: {last!r}")

    def send(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def js(self, expr):
        r = self.send("Runtime.evaluate", expression=expr,
                      returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--url", default="http://localhost:4321/")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--full", action="store_true", help="capture the entire page")
    ap.add_argument("--sel", help="scroll this selector to the top of the viewport")
    ap.add_argument("--click", help="click this selector before capturing")
    ap.add_argument("--reduced", action="store_true")
    ap.add_argument("--js", help="run this JS, then settle, before capturing")
    ap.add_argument("--settle", type=float, default=3.5)
    a = ap.parse_args()

    c = Chrome(a.w, a.h, a.reduced)
    try:
        c.send("Page.enable")
        c.send("Emulation.setDeviceMetricsOverride",
               width=a.w, height=a.h, deviceScaleFactor=1, mobile=a.w < 768)
        c.send("Page.navigate", url=a.url)
        time.sleep(a.settle)

        # Let lazy images below the fold actually fetch before we capture.
        c.js("(async()=>{const s=document.scrollingElement;"
             "for(let y=0;y<s.scrollHeight;y+=400){window.scrollTo(0,y);"
             "await new Promise(r=>setTimeout(r,12));}window.scrollTo(0,0);"
             "await new Promise(r=>setTimeout(r,400));return 1})()")

        if a.click:
            c.js(f"document.querySelector({a.click!r}).click()")
            time.sleep(1.4)

        if a.sel:
            c.js(f"(()=>{{const e=document.querySelector({a.sel!r});"
                 "if(!e)return 0;const y=e.getBoundingClientRect().top+window.scrollY;"
                 "window.scrollTo(0,y);return y})()")
            time.sleep(1.6)
            # Nudge scroll-linked animation to settle at this position.
            c.js("window.dispatchEvent(new Event('scroll'));1")
            time.sleep(.8)

        if a.js:
            c.js(a.js)
            time.sleep(1.5)
            c.js("window.dispatchEvent(new Event('scroll'))")
            time.sleep(1.0)

        params = {"format": "png"}
        if a.full:
            m = c.send("Page.getLayoutMetrics")["cssContentSize"]
            params["captureBeyondViewport"] = True
            params["clip"] = {"x": 0, "y": 0, "width": m["width"],
                              "height": m["height"], "scale": 1}
        shot = c.send("Page.captureScreenshot", **params)["data"]
        with open(a.out, "wb") as fh:
            fh.write(base64.b64decode(shot))
        print(f"{a.out}  {os.path.getsize(a.out)/1e6:.1f} MB")
    finally:
        c.close()


if __name__ == "__main__":
    sys.exit(main())
