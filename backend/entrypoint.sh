#!/bin/sh
# Multi-role Cloud Run entrypoint. Same image, different NEXRYDE_SERVICE_ROLE.
set -e
ROLE="${NEXRYDE_SERVICE_ROLE:-api}"
case "$ROLE" in
  kafka-worker|worker|replayer)
    exec python -m workers.kafka_consumer_worker
    ;;
  grpc-ridepush|grpc|ridepush)
    exec python grpc_ride_push_main.py
    ;;
  api|*)
    exec uvicorn server:app --host 0.0.0.0 --port "${PORT:-8080}"
    ;;
esac
