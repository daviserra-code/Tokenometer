import json
import os
import sys
import uuid

import requests


TOKENOMETER_URL = os.environ.get(
    "TOKENOMETER_URL",
    "https://www.tokenometer.cloud/api/proxy/openai/chat/completions",
)
INGEST_KEY = os.environ.get("TOKENOMETER_INGEST_KEY")


def main() -> int:
    if not INGEST_KEY:
        print("Missing TOKENOMETER_INGEST_KEY environment variable.")
        return 1

    payload = {
        "model": os.environ.get("TOKENOMETER_MODEL", "gpt-4o-mini"),
        "messages": [{"role": "user", "content": "Hello from Tokenometer smoke test"}],
        "max_tokens": 16,
    }
    headers = {
        "content-type": "application/json",
        "x-ingest-key": INGEST_KEY,
        "x-project": os.environ.get("TOKENOMETER_PROJECT", "Tokenometer Test"),
        "x-agent": os.environ.get("TOKENOMETER_AGENT", "manual-test"),
        "x-request-id": str(uuid.uuid4()),
    }

    try:
        response = requests.post(TOKENOMETER_URL, headers=headers, json=payload, timeout=60)
    except requests.RequestException as exc:
        print(f"Request failed: {exc}")
        return 1

    print(f"HTTP {response.status_code}")
    print(f"Request ID: {response.headers.get('x-request-id')}")
    print(f"Server Timing: {response.headers.get('server-timing')}")
    content_type = response.headers.get("content-type", "")

    if "application/json" in content_type:
        try:
            print(json.dumps(response.json(), indent=2))
        except ValueError:
            print(response.text)
    else:
        print(response.text)

    return 0 if response.ok else 1


if __name__ == "__main__":
    sys.exit(main())
