import hashlib
import hmac
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests


MeteringMode = str


@dataclass
class AdapterConfig:
    mode: MeteringMode
    tokenometer_base_url: str
    ingest_key: Optional[str] = None
    ingest_secret: Optional[str] = None
    project: Optional[str] = None
    team: Optional[str] = None
    agent: Optional[str] = None
    owner: Optional[str] = None
    source: Optional[str] = None
    credential_id: Optional[str] = None
    allow_direct_fallback: bool = True
    timeout_seconds: int = 30


def call_openai_chat(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = str(uuid.uuid4())

    if config.mode == "proxy":
        try:
            data = _post_json(
                f"{_trim(config.tokenometer_base_url)}/api/proxy/openai/chat/completions",
                headers=_proxy_headers(config, request_id),
                body=body,
                timeout_seconds=config.timeout_seconds,
            )
            return {
                "data": data,
                "request_id": request_id,
                "mode_used": "proxy",
                "metered_via": "proxy",
            }
        except Exception:
            if not config.allow_direct_fallback or not provider_api_key:
                raise
            result = _call_openai_compatible_direct(
                config=config,
                body=body,
                provider_name="OpenAI",
                provider_api_key=provider_api_key,
                direct_url="https://api.openai.com/v1/chat/completions",
                direct_headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {provider_api_key}",
                },
                request_id=request_id,
                source_name="shadow-openai",
                fallback_reason="proxy_unavailable",
            )
            result["mode_used"] = "proxy-fallback-direct"
            return result

    return _call_openai_compatible_direct(
        config=config,
        body=body,
        provider_name="OpenAI",
        provider_api_key=provider_api_key,
        direct_url="https://api.openai.com/v1/chat/completions",
        direct_headers={
            "content-type": "application/json",
            "authorization": f"Bearer {provider_api_key}",
        },
        request_id=request_id,
        source_name="shadow-openai",
    )


def call_anthropic_messages(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = str(uuid.uuid4())

    if config.mode == "proxy":
        try:
            data = _post_json(
                f"{_trim(config.tokenometer_base_url)}/api/proxy/anthropic/v1/messages",
                headers=_proxy_headers(config, request_id),
                body=body,
                timeout_seconds=config.timeout_seconds,
            )
            return {
                "data": data,
                "request_id": request_id,
                "mode_used": "proxy",
                "metered_via": "proxy",
            }
        except Exception:
            if not config.allow_direct_fallback or not provider_api_key:
                raise
            result = _call_anthropic_direct(
                config=config,
                body=body,
                provider_api_key=provider_api_key,
                request_id=request_id,
                fallback_reason="proxy_unavailable",
            )
            result["mode_used"] = "proxy-fallback-direct"
            return result

    return _call_anthropic_direct(
        config=config,
        body=body,
        provider_api_key=provider_api_key,
        request_id=request_id,
    )


def call_gemini_generate_content(
    config: AdapterConfig,
    model: str,
    body: Dict[str, Any],
    provider_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = str(uuid.uuid4())

    if config.mode == "proxy":
        try:
            data = _post_json(
                f"{_trim(config.tokenometer_base_url)}/api/proxy/google/v1beta/models/{model}:generateContent",
                headers=_proxy_headers(config, request_id),
                body=body,
                timeout_seconds=config.timeout_seconds,
            )
            return {
                "data": data,
                "request_id": request_id,
                "mode_used": "proxy",
                "metered_via": "proxy",
            }
        except Exception:
            if not config.allow_direct_fallback or not provider_api_key:
                raise
            result = _call_gemini_direct(
                config=config,
                model=model,
                body=body,
                provider_api_key=provider_api_key,
                request_id=request_id,
                fallback_reason="proxy_unavailable",
            )
            result["mode_used"] = "proxy-fallback-direct"
            return result

    return _call_gemini_direct(
        config=config,
        model=model,
        body=body,
        provider_api_key=provider_api_key,
        request_id=request_id,
    )


def call_mistral_chat(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = str(uuid.uuid4())

    if config.mode == "proxy":
        try:
            data = _post_json(
                f"{_trim(config.tokenometer_base_url)}/api/proxy/mistral/v1/chat/completions",
                headers=_proxy_headers(config, request_id),
                body=body,
                timeout_seconds=config.timeout_seconds,
            )
            return {
                "data": data,
                "request_id": request_id,
                "mode_used": "proxy",
                "metered_via": "proxy",
            }
        except Exception:
            if not config.allow_direct_fallback or not provider_api_key:
                raise
            result = _call_openai_compatible_direct(
                config=config,
                body=body,
                provider_name="Mistral",
                provider_api_key=provider_api_key,
                direct_url="https://api.mistral.ai/v1/chat/completions",
                direct_headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {provider_api_key}",
                },
                request_id=request_id,
                source_name="shadow-mistral",
                fallback_reason="proxy_unavailable",
            )
            result["mode_used"] = "proxy-fallback-direct"
            return result

    return _call_openai_compatible_direct(
        config=config,
        body=body,
        provider_name="Mistral",
        provider_api_key=provider_api_key,
        direct_url="https://api.mistral.ai/v1/chat/completions",
        direct_headers={
            "content-type": "application/json",
            "authorization": f"Bearer {provider_api_key}",
        },
        request_id=request_id,
        source_name="shadow-mistral",
    )


def call_github_models_chat(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = str(uuid.uuid4())

    if config.mode == "proxy":
        try:
            data = _post_json(
                f"{_trim(config.tokenometer_base_url)}/api/proxy/github/chat/completions",
                headers=_proxy_headers(config, request_id),
                body=body,
                timeout_seconds=config.timeout_seconds,
            )
            return {
                "data": data,
                "request_id": request_id,
                "mode_used": "proxy",
                "metered_via": "proxy",
            }
        except Exception:
            if not config.allow_direct_fallback or not provider_api_key:
                raise
            result = _call_openai_compatible_direct(
                config=config,
                body=body,
                provider_name="GitHub",
                provider_api_key=provider_api_key,
                direct_url="https://models.github.ai/inference/chat/completions",
                direct_headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {provider_api_key}",
                },
                request_id=request_id,
                source_name="shadow-github",
                fallback_reason="proxy_unavailable",
            )
            result["mode_used"] = "proxy-fallback-direct"
            return result

    return _call_openai_compatible_direct(
        config=config,
        body=body,
        provider_name="GitHub",
        provider_api_key=provider_api_key,
        direct_url="https://models.github.ai/inference/chat/completions",
        direct_headers={
            "content-type": "application/json",
            "authorization": f"Bearer {provider_api_key}",
        },
        request_id=request_id,
        source_name="shadow-github",
    )


def _call_openai_compatible_direct(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_name: str,
    provider_api_key: Optional[str],
    direct_url: str,
    direct_headers: Dict[str, str],
    request_id: str,
    source_name: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    _assert_provider_key(provider_api_key, provider_name)
    data = _post_json(
        direct_url,
        headers=direct_headers,
        body=body,
        timeout_seconds=config.timeout_seconds,
    )

    if config.mode == "shadow" or fallback_reason:
        _best_effort_shadow_ingest(
            config,
            _build_openai_compatible_event(
                provider_name=provider_name,
                model=body["model"],
                response=data,
                config=config,
                request_id=request_id,
                source_name=source_name,
                fallback_reason=fallback_reason,
            ),
        )

    return {
        "data": data,
        "request_id": request_id,
        "mode_used": config.mode,
        "metered_via": "ingest" if (config.mode == "shadow" or fallback_reason) else "none",
    }


def _call_anthropic_direct(
    config: AdapterConfig,
    body: Dict[str, Any],
    provider_api_key: Optional[str],
    request_id: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    _assert_provider_key(provider_api_key, "Anthropic")
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "content-type": "application/json",
            "x-api-key": provider_api_key,
            "anthropic-version": "2023-06-01",
        },
        body=body,
        timeout_seconds=config.timeout_seconds,
    )

    if config.mode == "shadow" or fallback_reason:
        _best_effort_shadow_ingest(
            config,
            _build_anthropic_event(
                model=body["model"],
                response=data,
                config=config,
                request_id=request_id,
                fallback_reason=fallback_reason,
            ),
        )

    return {
        "data": data,
        "request_id": request_id,
        "mode_used": config.mode,
        "metered_via": "ingest" if (config.mode == "shadow" or fallback_reason) else "none",
    }


def _call_gemini_direct(
    config: AdapterConfig,
    model: str,
    body: Dict[str, Any],
    provider_api_key: Optional[str],
    request_id: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    _assert_provider_key(provider_api_key, "Gemini")
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={provider_api_key}",
        headers={"content-type": "application/json"},
        body=body,
        timeout_seconds=config.timeout_seconds,
    )

    if config.mode == "shadow" or fallback_reason:
        _best_effort_shadow_ingest(
            config,
            _build_gemini_event(
                model=model,
                response=data,
                config=config,
                request_id=request_id,
                fallback_reason=fallback_reason,
            ),
        )

    return {
        "data": data,
        "request_id": request_id,
        "mode_used": config.mode,
        "metered_via": "ingest" if (config.mode == "shadow" or fallback_reason) else "none",
    }


def _best_effort_shadow_ingest(config: AdapterConfig, event: Dict[str, Any]) -> None:
    if not config.ingest_key or not config.ingest_secret:
        print("Tokenometer shadow ingest skipped: ingest key/secret missing.")
        return

    raw_body = json.dumps({"events": [event]})
    digest = hmac.new(
        config.ingest_secret.encode("utf-8"),
        raw_body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    try:
        requests.post(
            f"{_trim(config.tokenometer_base_url)}/api/ingest",
            headers={
                "content-type": "application/json",
                "x-ingest-key": config.ingest_key,
                "x-ingest-signature": f"sha256={digest}",
            },
            data=raw_body,
            timeout=config.timeout_seconds,
        )
    except Exception as exc:
        print(f"Tokenometer shadow ingest failed: {exc}")


def _proxy_headers(config: AdapterConfig, request_id: str) -> Dict[str, str]:
    if not config.ingest_key:
        raise RuntimeError("TOKENOMETER_INGEST_KEY is required for proxy mode.")

    headers = {
        "content-type": "application/json",
        "x-ingest-key": config.ingest_key,
        "x-request-id": request_id,
    }
    if config.project:
        headers["x-project"] = config.project
    if config.agent:
        headers["x-agent"] = config.agent
    if config.credential_id:
        headers["x-credential-id"] = config.credential_id
    return headers


def _build_openai_compatible_event(
    provider_name: str,
    model: str,
    response: Dict[str, Any],
    config: AdapterConfig,
    request_id: str,
    source_name: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    usage = response.get("usage", {})
    input_tokens = int(usage.get("prompt_tokens", 0) or 0)
    output_tokens = int(usage.get("completion_tokens", 0) or 0)
    total_tokens = int(usage.get("total_tokens", 0) or (input_tokens + output_tokens))
    return {
        "timestamp": _now_iso(),
        "provider": provider_name,
        "model": model,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "project": config.project,
        "team": config.team,
        "agent": config.agent,
        "owner": config.owner,
        "source": config.source or source_name,
        "metadata": {
          "requestId": request_id,
          "upstreamId": response.get("id"),
          "fallbackReason": fallback_reason,
        },
    }


def _build_anthropic_event(
    model: str,
    response: Dict[str, Any],
    config: AdapterConfig,
    request_id: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    usage = response.get("usage", {})
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    total_tokens = input_tokens + output_tokens
    return {
        "timestamp": _now_iso(),
        "provider": "Anthropic",
        "model": model,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "project": config.project,
        "team": config.team,
        "agent": config.agent,
        "owner": config.owner,
        "source": config.source or "shadow-anthropic",
        "metadata": {
            "requestId": request_id,
            "upstreamId": response.get("id"),
            "stopReason": response.get("stop_reason"),
            "fallbackReason": fallback_reason,
        },
    }


def _build_gemini_event(
    model: str,
    response: Dict[str, Any],
    config: AdapterConfig,
    request_id: str,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    usage = response.get("usageMetadata", {})
    input_tokens = int(usage.get("promptTokenCount", 0) or 0)
    output_tokens = int(usage.get("candidatesTokenCount", 0) or 0)
    total_tokens = int(usage.get("totalTokenCount", 0) or (input_tokens + output_tokens))
    return {
        "timestamp": _now_iso(),
        "provider": "Google",
        "model": model,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "project": config.project,
        "team": config.team,
        "agent": config.agent,
        "owner": config.owner,
        "source": config.source or "shadow-gemini",
        "metadata": {
            "requestId": request_id,
            "fallbackReason": fallback_reason,
        },
    }


def _post_json(
    url: str,
    headers: Dict[str, str],
    body: Dict[str, Any],
    timeout_seconds: int,
) -> Dict[str, Any]:
    response = requests.post(url, headers=headers, json=body, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()


def _trim(value: str) -> str:
    return value.rstrip("/")


def _assert_provider_key(value: Optional[str], provider_name: str) -> None:
    if not value:
        raise RuntimeError(
            f"{provider_name} direct/shadow mode requires the provider API key in the app environment."
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    config = AdapterConfig(
        mode=os.environ.get("AI_METERING_MODE", "proxy"),
        tokenometer_base_url=os.environ.get("TOKENOMETER_BASE_URL", "https://www.tokenometer.cloud"),
        ingest_key=os.environ.get("TOKENOMETER_INGEST_KEY"),
        ingest_secret=os.environ.get("TOKENOMETER_INGEST_SECRET"),
        project=os.environ.get("TOKENOMETER_PROJECT", "My App"),
        agent=os.environ.get("TOKENOMETER_AGENT", "support-bot"),
        allow_direct_fallback=True,
    )

    result = call_openai_chat(
        config=config,
        body={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "Hello from Tokenometer adapter"}],
        },
        provider_api_key=os.environ.get("OPENAI_API_KEY"),
    )
    print(json.dumps(result, indent=2))
