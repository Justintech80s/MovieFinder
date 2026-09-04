import os
from fastapi import FastAPI
from pydantic import BaseModel
from .models import Credit
from .person_search import run_person_search

app = FastAPI(title="MovieFinder Cinema Brain")


class PersonSearchPayload(BaseModel):
    intent: dict
    person: dict
    credits: list[dict]


@app.get("/health")
async def health():
    return {"ok": True, "status": "ok", "service": "moviefinder-python"}


@app.get("/ready")
async def ready():
    database_configured = bool(
        os.getenv("SUPABASE_URL")
        and (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY"))
    )
    ai_configured = any(
        os.getenv(key) and os.getenv(model)
        for key, model in (
            ("OPENAI_API_KEY", "OPENAI_MODEL"),
            ("ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"),
            ("GEMINI_API_KEY", "GEMINI_MODEL"),
            ("XAI_API_KEY", "XAI_MODEL"),
        )
    )
    cache_configured = bool(os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_REST_URL"))
    return {
        "ready": True,
        "status": "ready",
        "subsystems": {
            "python": {"status": "ready"},
            "database": {"status": "configured" if database_configured else "not_configured"},
            "cache": {"status": "configured" if cache_configured else "not_configured"},
            "ai": {"status": "configured" if ai_configured else "not_configured"},
        },
    }


@app.post("/person-search")
async def person_search(payload: PersonSearchPayload):
    credits = [Credit(**item) for item in payload.credits]

    async def resolve(_name, _role):
        return {"person": payload.person, "credits": credits, "verified": True}

    async def no_availability(_credit):
        return None

    return await run_person_search(payload.intent, resolve, no_availability)
