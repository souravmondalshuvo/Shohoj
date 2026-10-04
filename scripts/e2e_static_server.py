#!/usr/bin/env python3
"""Static file server for the Playwright suites.

A drop-in for `python3 -m http.server PORT --bind 127.0.0.1 [--directory DIR]`
with one difference: a listen backlog that survives the legacy page's boot.

The un-bundled page imports about a hundred ES modules at once, and http.server
answers in HTTP/1.0, so every one of them is its own connection. The stock
server listens with socketserver's default backlog of 5. Under that burst a
connection is occasionally refused, the browser reports
net::ERR_CONNECTION_RESET for one module, and a single failed import takes the
whole module graph with it: main.js never runs, the calculator stays hidden and
every assertion in that test times out. It showed up as a different handful of
tests failing on each run, all of which passed when re-run alone.

Usage:
    python3 scripts/e2e_static_server.py PORT [--directory DIR]
"""

import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"


class BurstTolerantServer(ThreadingHTTPServer):
    # The kernel caps this at kern.ipc.somaxconn / net.core.somaxconn, which is
    # 128 on macOS and at least that on the CI runner.
    request_queue_size = 128


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("port", type=int)
    parser.add_argument("--directory", default=os.getcwd())
    args = parser.parse_args()

    handler = partial(SimpleHTTPRequestHandler, directory=args.directory)
    with BurstTolerantServer((HOST, args.port), handler) as server:
        print(f"Serving {args.directory} on http://{HOST}:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
