"""
WorkBuddy -> FreeModel API Proxy - OpenAI-compatible Web API (FastAPI)

Fully OpenAI-compatible — can be used as a custom provider in OpenRouter,
Open WebUI, Cursor, ChatBox, and any OpenAI-compatible client.

Client WAJIB mengirim FreeModel API key sendiri via Authorization header.
Tidak ada fallback key server.

Endpoints:
  POST /v1/chat/completions   — Chat completions (streaming supported)
  GET  /v1/models             — List available models
  GET  /health                — Health check (fast, no inference)
  GET  /health/warm           — Warm-up endpoint (pings upstream to prevent cold start)

Environment variables:
  API_KEY  (optional) — gate key. Jika diset, client wajib kirim ini via
                        Authorization header dan FreeModel key via
                        X-FreeModel-API-Key header.
  PORT     (optional) — server port (default: 8000)
  WARMUP_INTERVAL (optional) — auto warm-up interval in seconds (default: 300 = 5min)
"""

import json
import os
import time
import uuid
import threading

import asyncio
import json
import os
import time
import uuid

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from src.cli import (
    ENDPOINT,
    DEFAULT_MODEL,
    _system_prompt,
    _headers,
)

# Shared httpx client for connection pooling (reduces TLS handshake overhead)
_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _client

# ── App ────────────────────────────────────────────────────────────────

app = FastAPI(title="WorkBuddy FreeModel Proxy", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ────────────────────────────────────────────────────────────

def _build_messages(messages: list[dict], model: str, skip_prompt: bool = False) -> list[dict]:
    """Prepend the WorkBuddy system prompt before user-provided messages.
    Skip when skip_prompt=True — client already included system prompt
    or wants raw model behavior (saves ~2k tokens)."""
    if skip_prompt:
        return messages
    return [{"role": "system", "content": _system_prompt(model)}, *messages]


def _make_id() -> str:
    return f"chatcmpl-{uuid.uuid4().hex[:12]}"


def _resolve_fm_key(request: Request) -> str:
    """
    Resolve FreeModel API key.

    Priority:
    1. FREEMODEL_API_KEY env var (server-side, always used)
    2. X-FreeModel-API-Key header (override per-request)
    3. Authorization Bearer token (if not gate key)
    """
    # Env var always wins — server owns the key
    env_key = os.environ.get("FREEMODEL_API_KEY", "")
    if env_key:
        return env_key

    explicit = request.headers.get("X-FreeModel-API-Key", "")
    if explicit:
        return explicit

    gate_key = os.environ.get("API_KEY", "")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        bearer_key = auth.removeprefix("Bearer ")
        if bearer_key and bearer_key != gate_key:
            return bearer_key

    return ""


async def _verify_gate_key(request: Request):
    """
    Jika API_KEY env var di set, dia jadi mandatory gate.
    Client harus kirim Authorization: Bearer <API_KEY> untuk lulus.
    FreeModel key dikirim via header X-FreeModel-API-Key.
    """
    gate_key = os.environ.get("API_KEY", "")
    if not gate_key:
        return

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth.removeprefix("Bearer ") != gate_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API_KEY gate key")


# ── Warm-up ────────────────────────────────────────────────────────────

_warm_lock = threading.Lock()
_warm_last_ts = 0.0


def _do_warmup():
    """Send a tiny inference request to keep FreeModel backend alive."""
    import requests as _requests
    global _warm_last_ts
    fm_key = os.environ.get("FREEMODEL_API_KEY", "")
    if not fm_key:
        return
    try:
        t0 = time.time()
        _requests.post(
            ENDPOINT,
            headers=_headers(fm_key),
            json={"model": DEFAULT_MODEL, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5},
            timeout=30,
        )
        _warm_last_ts = time.time()
        print(f"[WARMUP] OK in {int((time.time()-t0)*1000)}ms")
    except Exception as e:
        print(f"[WARMUP] FAILED: {e}")


def _warmup_scheduler():
    """Background thread that pings FreeModel periodically."""
    interval = int(os.environ.get("WARMUP_INTERVAL", "300"))
    # Initial delay: warm up 30s after startup
    time.sleep(30)
    _do_warmup()
    while True:
        time.sleep(interval)
        _do_warmup()


# Start warm-up background thread on module load
_warmup_thread = threading.Thread(target=_warmup_scheduler, daemon=True)
_warmup_thread.start()


# ── Routes ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "workbuddy-freemodel-proxy", "version": "1.1.0"}


@app.get("/health/warm")
async def health_warm():
    """Manual warm-up trigger. Returns last warm-up timestamp."""
    _do_warmup()
    return {"status": "ok", "warmed_at": _warm_last_ts}


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": DEFAULT_MODEL,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "freemodel",
            }
        ],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    await _verify_gate_key(request)

    fm_key = _resolve_fm_key(request)
    if not fm_key:
        raise HTTPException(
            status_code=401,
            detail="FreeModel API key is required. "
            "Send Authorization: Bearer <your-freemodel-api-key>",
        )

    body = await request.json()
    model = body.get("model", DEFAULT_MODEL)
    messages = body.get("messages", [])
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens")
    temperature = body.get("temperature", 0.7)
    top_p = body.get("top_p", 1.0)

    # Skip WorkBuddy system prompt when client sends X-Skip-Prompt header
    # or when client already includes a system message (saves ~2k tokens)
    skip_prompt = (
        request.headers.get("X-Skip-Prompt", "").lower() in ("true", "1", "yes")
        or any(m.get("role") == "system" for m in messages)
    )

    if not messages:
        raise HTTPException(status_code=400, detail="messages is required")

    full_messages = _build_messages(messages, model, skip_prompt=skip_prompt)

    payload = {
        "model": model,
        "messages": full_messages,
        "stream": stream,
        "temperature": temperature,
        "top_p": top_p,
    }
    if "tools" in body:
        payload["tools"] = body["tools"]
    if "tool_choice" in body:
        payload["tool_choice"] = body["tool_choice"]
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    if stream:
        return _stream_response(model, payload, fm_key)
    else:
        return _sync_response(model, payload, fm_key)


# ── Response handlers ──────────────────────────────────────────────────

def _fix_usage(usage: dict, messages: list, tools: list = None) -> dict:
    """Ensure prompt_tokens is never 0. FreeModel omits it; estimate from input."""
    pt = usage.get("prompt_tokens", 0)
    if pt == 0:
        # Rough estimation: chars / 4 (English) + tool schema chars
        total_chars = sum(len(m.get("content", "")) for m in messages)
        if tools:
            total_chars += len(json.dumps(tools))
        pt = max(1, total_chars // 4)
    ct = usage.get("completion_tokens", 0)
    return {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": pt + ct}


async def _sync_response(model: str, payload: dict, fm_key: str) -> JSONResponse:
    client = get_client()
    resp = await client.post(
        ENDPOINT,
        headers=_headers(fm_key),
        json=payload,
    )

    if resp.status_code != 200:
        detail = resp.text[:500]
        raise HTTPException(status_code=resp.status_code, detail=detail)

    upstream = resp.json()
    choice = upstream["choices"][0]

    openai_resp = {
        "id": _make_id(),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    **({"content": choice["message"]["content"]} if choice["message"].get("content") else {}),
                    **({"tool_calls": choice["message"]["tool_calls"]} if choice["message"].get("tool_calls") else {}),
                },
                "finish_reason": choice.get("finish_reason", "stop"),
            }
        ],
        "usage": _fix_usage(upstream.get("usage", {}), payload.get("messages", []), payload.get("tools")),
    }
    return JSONResponse(content=openai_resp)


def _stream_response(model: str, payload: dict, fm_key: str) -> StreamingResponse:
    async def generate():
        client = get_client()
        async with client.stream(
            "POST",
            ENDPOINT,
            headers=_headers(fm_key),
            json=payload,
        ) as resp:
            if resp.status_code != 200:
                body_text = await resp.aread()
                yield _sse_chunk(model, "", "error")
                yield f"event: error\ndata: {body_text.decode()[:500]}\n\n"
                yield "data: [DONE]\n\n"
                return

            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return

                    try:
                        chunk = json.loads(data)
                        choices = chunk.get("choices", [{}])
                        delta = choices[0].get("delta", {})
                        finish = choices[0].get("finish_reason")

                        # Forward tool_calls if present in delta
                        tool_calls = delta.get("tool_calls")
                        if tool_calls:
                            yield _sse_tool_chunk(model, tool_calls, finish)
                        else:
                            content = delta.get("content", "")
                            if content or finish:
                                yield _sse_chunk(model, content, finish)
                    except json.JSONDecodeError:
                        pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_tool_chunk(model: str, tool_calls: list, finish_reason: str | None = None) -> str:
    """SSE chunk specifically for tool_calls delta."""
    chunk = {
        "id": _make_id(),
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"role": "assistant", "tool_calls": tool_calls},
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(chunk)}\n\n"


def _sse_chunk(model: str, content: str, finish_reason: str | None = None) -> str:
    delta: dict = {"role": "assistant", "content": content}
    chunk = {
        "id": _make_id(),
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }
    return f"data: {json.dumps(chunk)}\n\n"


# ── Entrypoint ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("src.api:app", host="0.0.0.0", port=port)
