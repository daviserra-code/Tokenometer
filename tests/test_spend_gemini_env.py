import json
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "examples" / "integration"))

from tokenometer_adapter import AdapterConfig, call_gemini_generate_content


def main() -> None:
    config = AdapterConfig(
        mode=os.environ.get("AI_METERING_MODE", "proxy"),
        tokenometer_base_url=os.environ.get("TOKENOMETER_BASE_URL", "https://www.tokenometer.cloud"),
        ingest_key=os.environ.get("TOKENOMETER_INGEST_KEY"),
        ingest_secret=os.environ.get("TOKENOMETER_INGEST_SECRET"),
        project=os.environ.get("TOKENOMETER_PROJECT", "Spend Test"),
        team=os.environ.get("TOKENOMETER_TEAM"),
        agent=os.environ.get("TOKENOMETER_AGENT", "gemini-spend-test"),
        owner=os.environ.get("TOKENOMETER_OWNER"),
        source="test-spend-gemini",
        allow_direct_fallback=True,
    )

    result = call_gemini_generate_content(
        config=config,
        model=os.environ.get("GOOGLE_MODEL", "gemini-2.0-flash"),
        body={
            "contents": [
                {
                    "parts": [
                        {
                            "text": "Reply with one short sentence confirming this Gemini spend test reached the model."
                        }
                    ]
                }
            ]
        },
        provider_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY"),
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
