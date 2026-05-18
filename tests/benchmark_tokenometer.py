import concurrent.futures
import json
import os
import statistics
import sys
import time
import uuid
from typing import Any

import requests


TOKENOMETER_URL = os.environ.get(
    "TOKENOMETER_URL",
    "https://www.tokenometer.cloud/api/proxy/openai/chat/completions",
)
INGEST_KEY = os.environ.get("TOKENOMETER_INGEST_KEY")
REQUESTS_TOTAL = int(os.environ.get("TOKENOMETER_REQUESTS", "5"))
CONCURRENCY = int(os.environ.get("TOKENOMETER_CONCURRENCY", "1"))
TIMEOUT_SECONDS = int(os.environ.get("TOKENOMETER_TIMEOUT_SECONDS", "60"))
MODEL = os.environ.get("TOKENOMETER_MODEL", "gpt-4o-mini")


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = (len(ordered) - 1) * pct
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def run_one(index: int) -> dict[str, Any]:
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": f"Benchmark ping #{index + 1}"}],
        "max_tokens": 16,
    }
    headers = {
        "content-type": "application/json",
        "x-ingest-key": INGEST_KEY,
        "x-project": "Tokenometer Benchmark",
        "x-agent": "benchmark-script",
        "x-request-id": str(uuid.uuid4()),
    }

    started = time.perf_counter()
    try:
        response = requests.post(
            TOKENOMETER_URL,
            headers=headers,
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": response.ok,
            "status": response.status_code,
            "elapsed_ms": elapsed_ms,
            "request_id": response.headers.get("x-request-id"),
            "server_timing": response.headers.get("server-timing"),
            "body": response.text[:300],
        }
    except requests.RequestException as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": False,
            "status": 0,
            "elapsed_ms": elapsed_ms,
            "request_id": None,
            "server_timing": None,
            "body": str(exc),
        }


def main() -> int:
    if not INGEST_KEY:
        print("Missing TOKENOMETER_INGEST_KEY environment variable.")
        return 1
    if REQUESTS_TOTAL < 1:
        print("TOKENOMETER_REQUESTS must be at least 1.")
        return 1
    if CONCURRENCY < 1:
        print("TOKENOMETER_CONCURRENCY must be at least 1.")
        return 1

    overall_started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        results = list(executor.map(run_one, range(REQUESTS_TOTAL)))
    overall_elapsed_ms = (time.perf_counter() - overall_started) * 1000

    successes = [result for result in results if result["ok"]]
    latencies = [result["elapsed_ms"] for result in successes]

    summary = {
        "url": TOKENOMETER_URL,
        "model": MODEL,
        "requests": REQUESTS_TOTAL,
        "concurrency": CONCURRENCY,
        "successes": len(successes),
        "failures": REQUESTS_TOTAL - len(successes),
        "wall_clock_ms": round(overall_elapsed_ms, 2),
        "latency_ms": {
            "min": round(min(latencies), 2) if latencies else None,
            "avg": round(statistics.mean(latencies), 2) if latencies else None,
            "p50": round(percentile(latencies, 0.50), 2) if latencies else None,
            "p95": round(percentile(latencies, 0.95), 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
        },
        "sample_request_ids": [result["request_id"] for result in results[:3]],
        "results": results,
    }

    print(json.dumps(summary, indent=2))
    return 0 if len(successes) == REQUESTS_TOTAL else 1


if __name__ == "__main__":
    sys.exit(main())
