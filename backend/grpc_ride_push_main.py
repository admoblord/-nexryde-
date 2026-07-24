"""Standalone Cloud Run entrypoint for native gRPC RidePush.

Uses the same Redis-backed hubs as the HTTP API so offers/trip updates
fan out across instances. Cloud Run service must use HTTP/2 (h2c).

  NEXRYDE_GRPC_PORT=${PORT:-50051}
  NEXRYDE_SERVICE_ROLE=grpc-ridepush
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("grpc_ride_push_main")


def _start_health(port: int) -> HTTPServer:
    started = time.time()

    class H(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = json.dumps(
                {
                    "ok": True,
                    "service": "grpc-ridepush",
                    "grpc_port": os.environ.get("NEXRYDE_GRPC_PORT"),
                    "uptime_sec": int(time.time() - started),
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: Any) -> None:
            return

    # Health on adjacent port when gRPC owns PORT; Cloud Run uses single PORT —
    # we put gRPC on PORT and health responds on same process via separate path
    # only when NEXRYDE_HEALTH_PORT is set. Default: health shares nothing;
    # Cloud Run grpc protocol probes TCP.
    server = HTTPServer(("0.0.0.0", port), H)
    Thread(target=server.serve_forever, daemon=True).start()
    return server


async def main() -> None:
    # Cloud Run (HTTP/2) injects PORT — bind gRPC there.
    port = int(os.environ.get("NEXRYDE_GRPC_PORT") or os.environ.get("PORT") or "50051")
    os.environ["NEXRYDE_GRPC_PORT"] = str(port)

    health_port = (os.environ.get("NEXRYDE_HEALTH_PORT") or "").strip()
    health_srv = None
    if health_port:
        health_srv = _start_health(int(health_port))
        logger.info("grpc health HTTP on :%s", health_port)

    from grpc_ride_push import _serve_grpc, stop_grpc_ride_push

    stop = asyncio.Event()

    def _sig(*_a: Any) -> None:
        stop.set()

    try:
        loop = asyncio.get_running_loop()
        for s in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(s, _sig)
    except NotImplementedError:
        pass

    grpc_task = asyncio.create_task(_serve_grpc(port), name="grpc-ridepush")
    logger.info("grpc RidePush dedicated service listening on %s", port)
    await stop.wait()
    await stop_grpc_ride_push()
    grpc_task.cancel()
    if health_srv is not None:
        health_srv.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
