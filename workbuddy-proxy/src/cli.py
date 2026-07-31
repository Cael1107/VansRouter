"""
WorkBuddy -> FreeModel API proxy (CLI).

The FreeModel API (work.freemodel.dev) rejects non-WorkBuddy clients with
403 "unsupported_client". The gate is the system prompt: the request must
include specific sections of the WorkBuddy prompt template.

This module exports shared utilities (ENDPOINT, DEFAULT_MODEL, _system_prompt,
_headers, chat) used by both the CLI and the web API wrapper.

Usage:
    python -m src.cli --api-key fe_oa_xxx "Your question here"
    python -m src.cli --api-key fe_oa_xxx   (interactive mode)

Requires: pip install requests
"""

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

import requests

ENDPOINT = "https://work.freemodel.dev/v1/chat/completions"
PRODUCT_VERSION = "5.2.7"
DEFAULT_MODEL = "gpt-5.6-sol"
TEMPLATE_FILE = Path(__file__).parent / "prompt.tpl"


def _system_prompt(model: str) -> str:
    """Load and render the trimmed WorkBuddy template."""
    tpl = TEMPLATE_FILE.read_text(encoding="utf-8")
    return (
        tpl.replace("{{ modelName }}", model)
        .replace("{{ productName }}", "WorkBuddy AI")
        .replace("{{ dataFolderName }}", ".workbuddy")
        .replace("{{ ResponseLanguage }}", "English")
        .replace("{{ IsWindows }}", "true")
    )


def _headers(api_key: str) -> dict:
    """Build WorkBuddy client headers."""
    msg_id = uuid.uuid4().hex
    trace_id = uuid.uuid4().hex[:32]
    span_id = uuid.uuid4().hex[:16]
    return {
        "Content-Type": "application/json",
        "X-Conversation-ID": str(uuid.uuid4()),
        "X-Conversation-Request-ID": str(uuid.uuid4()),
        "X-Conversation-Message-ID": msg_id,
        "X-Request-ID": msg_id,
        "X-Agent-Intent": "craft",
        "X-Agent-Purpose": "person_agent",
        "X-IDE-Type": "CLI",
        "X-IDE-Name": "win32",
        "X-IDE-Version": "10.0.0",
        "X-Product": "SaaS",
        "X-Product-Version": PRODUCT_VERSION,
        "X-API-Key": api_key,
        "Authorization": f"Bearer {api_key}",
        "traceparent": f"00-{trace_id}-{span_id}-01",
        "b3": f"{trace_id}-{span_id}-1",
        "X-B3-TraceId": trace_id,
        "X-B3-SpanId": span_id,
        "X-B3-Sampled": "1",
        "X-Trace-ID": trace_id,
    }


def chat(
    api_key: str,
    user_message: str,
    model: str = DEFAULT_MODEL,
    history: list | None = None,
    stream: bool = False,
    max_tokens: int | None = None,
) -> dict:
    """Send a chat completion request to FreeModel impersonating WorkBuddy."""
    messages = [{"role": "system", "content": _system_prompt(model)}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    payload = {"model": model, "messages": messages, "stream": stream}
    if max_tokens:
        payload["max_tokens"] = max_tokens

    response = requests.post(
        ENDPOINT, headers=_headers(api_key), json=payload, timeout=120
    )
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(
        description="Call FreeModel API as a WorkBuddy client."
    )
    parser.add_argument("prompt", nargs="?", default="")
    parser.add_argument("--api-key", default=os.environ.get("FREEMODEL_API_KEY", ""))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-tokens", type=int, default=None)
    parser.add_argument("--raw", action="store_true", help="Print raw JSON response")
    args = parser.parse_args()

    if not args.api_key:
        sys.exit("Error: provide --api-key or set FREEMODEL_API_KEY env var")

    if not args.prompt:
        history = []
        print("WorkBuddy -> FreeModel (interactive). Ctrl+C to exit.\n")
        while True:
            try:
                user_input = input("you> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nbye.")
                break
            if not user_input:
                continue
            result = chat(
                args.api_key, user_input, args.model, history, max_tokens=args.max_tokens
            )
            reply = result["choices"][0]["message"]["content"]
            print(f"\nassistant> {reply}\n")
            history.append({"role": "user", "content": user_input})
            history.append({"role": "assistant", "content": reply})
    else:
        result = chat(
            args.api_key, args.prompt, args.model, max_tokens=args.max_tokens
        )
        if args.raw:
            print(json.dumps(result, indent=2))
        else:
            print(result["choices"][0]["message"]["content"])


if __name__ == "__main__":
    main()
