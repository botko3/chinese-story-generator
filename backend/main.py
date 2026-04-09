"""
ISF Academy Chinese Story Generator — FastAPI backend.

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import time
import re
from pathlib import Path
from typing import Any

# from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIConnectionError, APIError, AuthenticationError, OpenAI, RateLimitError
from pydantic import BaseModel, Field, field_validator

# Load .env from this file's directory so it works whether you run uvicorn from backend/ or repo root.
# _BACKEND_DIR = Path(__file__).resolve().parent
# load_dotenv(_BACKEND_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"

# Reuse one client so HTTP keep-alive / connections are pooled (saves RTT on each request).
_openai_client: OpenAI | None = None


def _deepseek_max_tokens() -> int:
    raw = os.getenv("DEEPSEEK_MAX_TOKENS", "3072").strip()
    try:
        n = int(raw)
        return max(512, min(n, 8192))
    except ValueError:
        return 3072


def _deepseek_temperature() -> float:
    raw = os.getenv("DEEPSEEK_TEMPERATURE", "0.65").strip()
    try:
        t = float(raw)
        return max(0.0, min(t, 2.0))
    except ValueError:
        return 0.65

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    # Production frontend (add more via CORS_ORIGINS on Railway / .env)
    "https://chinese-story-generator.vercel.app",
]


def _parse_cors_origins() -> list[str]:
    """Merge defaults with CORS_ORIGINS so local dev keeps working when you add Vercel etc."""
    raw = os.getenv("CORS_ORIGINS", "").strip()
    extra = [o.strip() for o in raw.split(",") if o.strip()]
    merged: list[str] = []
    seen: set[str] = set()
    for o in [*DEFAULT_CORS_ORIGINS, *extra]:
        if o not in seen:
            seen.add(o)
            merged.append(o)
    return merged


app = FastAPI(
    title="ISF Academy Chinese Story Generator",
    description="Generates primary-school Chinese stories for Hong Kong / Chinese cultural context.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_client() -> OpenAI:
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Server is not configured: DEEPSEEK_API_KEY is missing in environment.",
        )
    # timeout: story generation can take tens of seconds
    _openai_client = OpenAI(
        api_key=key,
        base_url=DEEPSEEK_BASE_URL,
        timeout=180.0,
        max_retries=2,
    )
    return _openai_client


SYSTEM_PROMPT = """You are an expert Chinese language educator for ISF Academy (弘立書院) in Hong Kong. Your sole task is to write and structure short Chinese stories for primary school learners (小學生).

## Pedagogical goals
- Support reading fluency, character recognition, and cultural awareness.
- Align tone and complexity with Hong Kong primary Chinese curriculum expectations and everyday school life where appropriate.
- Celebrate Chinese culture (including Hong Kong heritage, festivals, family values, courtesy, community, nature, and shared traditions) in a warm, age-appropriate way.
- Use vocabulary and sentence patterns suitable for the requested grade and difficulty; avoid rare classical idioms unless the difficulty explicitly allows simplified explanations.
- Keep content positive, inclusive, and respectful; avoid frightening, violent, political, or inappropriate themes.

## Story craft
- Write a coherent narrative with a clear beginning, middle, and end.
- Prefer concrete scenes, dialogue, and sensory detail over abstract moral lecturing; learning should feel natural.
- If vocabulary focus is provided, weave those words in naturally and reinforce meaning through context.
- Match length to grade/difficulty: generally aim for roughly 200–450 Chinese characters for the story body unless the theme demands slightly shorter text for beginners.

## Pinyin and formatting rules
- If the user requests pinyin: include pinyin for the story text in a learner-friendly way (e.g. after each sentence or clause in parentheses), using standard Hanyu Pinyin with tone marks where appropriate. Keep the Chinese text as the main reading line.
- If the user does NOT request pinyin: output the story in Chinese only (no pinyin in the main story content).
- Emphasize key taught characters/phrases using **bold** in the story content only where it helps learning (do not bold entire paragraphs).

## Vocabulary list
- Provide a vocabulary_list array: each item must include the word (词语/字), pinyin, and a short child-friendly meaning in English or simple Chinese as appropriate for the reader.
- Choose 6–12 items that are most valuable for revision, prioritizing any requested vocab_focus terms when relevant.

## Comprehension questions
- If the user requests questions: provide 3–5 short questions that check literal understanding, simple inference, and one light reflection or connection to culture/theme.
- If the user does NOT request questions: set "questions" to an empty array [].

## Output contract (critical)
- Respond with ONE valid JSON object only. No markdown fences, no commentary before or after the JSON.
- Required keys: "title", "content", "vocabulary_list", "questions".
- "vocabulary_list" is an array of objects with keys: "word", "pinyin", "meaning".
- "questions" is an array of strings.
- Use UTF-8 Chinese characters correctly; escape any quotes inside strings per JSON rules.

## When the user request JSON has "concise": true (fast mode)
- Prioritize a **shorter** story body: about **120–220 Chinese characters** (still complete narrative).
- vocabulary_list: **6 items** (not more than 8).
- questions: **exactly 3** short questions.
- Keep pinyin compact if requested (e.g. per phrase) so total JSON is smaller — this **reduces generation latency** because the model emits fewer tokens.
"""


class StoryRequest(BaseModel):
    grade: str = Field(..., min_length=1, description="Primary grade level (e.g. P3, 三年級).")
    theme: str = Field(default="", description="Story theme or topic.")
    vocab_focus: str = Field(default="", description="Words or patterns to emphasize.")
    difficulty: int = Field(default=3, ge=1, le=5, description="1=easiest, 5=most challenging.")
    include_pinyin: bool = Field(default=True)
    include_questions: bool = Field(default=True)
    concise: bool = Field(
        default=False,
        description="Shorter story & smaller JSON — fewer output tokens, usually faster.",
    )

    @field_validator("grade", "theme", "vocab_focus", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class VocabularyItem(BaseModel):
    word: str
    pinyin: str = ""
    meaning: str = ""


class StoryResponse(BaseModel):
    title: str
    content: str
    pinyin_enabled: bool
    vocabulary_list: list[VocabularyItem]
    questions: list[str]


def _extract_json_object(text: str) -> dict[str, Any]:
    """Parse model output; tolerate optional ```json fences."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("Parsed JSON must be an object.")
    return data


def _normalize_story_payload(
    data: dict[str, Any],
    *,
    pinyin_requested: bool,
    questions_requested: bool,
) -> StoryResponse:
    title = data.get("title")
    content = data.get("content")
    if not isinstance(title, str) or not title.strip():
        raise ValueError('Missing or invalid "title".')
    if not isinstance(content, str) or not content.strip():
        raise ValueError('Missing or invalid "content".')

    raw_vocab = data.get("vocabulary_list", data.get("vocabulary", []))
    vocabulary_list: list[VocabularyItem] = []
    if isinstance(raw_vocab, list):
        for item in raw_vocab:
            if isinstance(item, dict):
                vocabulary_list.append(
                    VocabularyItem(
                        word=str(item.get("word", "")).strip(),
                        pinyin=str(item.get("pinyin", "")).strip(),
                        meaning=str(item.get("meaning", "")).strip(),
                    )
                )
            elif isinstance(item, str) and item.strip():
                vocabulary_list.append(VocabularyItem(word=item.strip(), pinyin="", meaning=""))

    raw_q = data.get("questions", [])
    questions: list[str] = []
    if questions_requested and isinstance(raw_q, list):
        questions = [str(q).strip() for q in raw_q if str(q).strip()]

    return StoryResponse(
        title=title.strip(),
        content=content.strip(),
        pinyin_enabled=pinyin_requested,
        vocabulary_list=vocabulary_list,
        questions=questions,
    )


def _build_user_message(req: StoryRequest) -> str:
    payload: dict[str, Any] = {
        "task": "generate_story",
        "grade": req.grade,
        "theme": req.theme or None,
        "vocab_focus": req.vocab_focus or None,
        "difficulty_1_to_5": req.difficulty,
        "include_pinyin": req.include_pinyin,
        "include_questions": req.include_questions,
        "concise": req.concise,
    }
    return json.dumps(payload, ensure_ascii=False)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generate-story", response_model=StoryResponse)
async def generate_story(request: StoryRequest) -> StoryResponse:
    client = _get_client()
    user_message = _build_user_message(request)

    max_out = _deepseek_max_tokens()
    if request.concise:
        max_out = min(max_out, 2400)

    try:
        t0 = time.perf_counter()
        completion = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=_deepseek_temperature(),
            max_tokens=max_out,
            response_format={"type": "json_object"},
            stream=False,
        )
        elapsed = time.perf_counter() - t0
        usage = getattr(completion, "usage", None)
        logger.info(
            "generate-story: model=%s max_tokens=%s concise=%s elapsed=%.2fs usage=%s",
            DEEPSEEK_MODEL,
            max_out,
            request.concise,
            elapsed,
            usage,
        )
    except AuthenticationError as e:
        logger.exception("DeepSeek authentication failed")
        raise HTTPException(status_code=502, detail="Upstream API authentication failed.") from e
    except RateLimitError as e:
        logger.warning("DeepSeek rate limit: %s", e)
        raise HTTPException(status_code=429, detail="Story service is busy. Please try again shortly.") from e
    except APIConnectionError as e:
        logger.exception("DeepSeek connection error")
        raise HTTPException(status_code=502, detail="Could not reach the story generation service.") from e
    except APIError as e:
        logger.exception("DeepSeek API error")
        raise HTTPException(
            status_code=502,
            detail=f"Story generation failed: {getattr(e, 'message', str(e))}",
        ) from e

    message = completion.choices[0].message
    raw = (message.content or "").strip()
    if not raw:
        raise HTTPException(status_code=502, detail="Empty response from story model.")

    try:
        payload = _extract_json_object(raw)
        return _normalize_story_payload(
            payload,
            pinyin_requested=request.include_pinyin,
            questions_requested=request.include_questions,
        )
    except ValueError as e:
        logger.warning("Failed to parse model JSON: %s\nRaw (truncated): %s", e, raw[:800])
        raise HTTPException(
            status_code=502,
            detail="The model returned an unexpected format. Please retry.",
        ) from e
