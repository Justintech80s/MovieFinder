import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from .models import Credit
from .person_search import run_person_search
from .ml import CinemaML

app = FastAPI(title="MovieFinder Cinema Brain")
app.state.cinema_ml = CinemaML()


class PersonSearchPayload(BaseModel):
    intent: dict
    person: dict
    credits: list[dict]


class EmbedQueryPayload(BaseModel):
    text: str


class EmbedTextsPayload(BaseModel):
    texts: list[str]


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


@app.post("/embed-query")
async def embed_query(payload: EmbedQueryPayload):
    text = payload.text.strip()
    if not text:
        return JSONResponse(status_code=400, content={"code": "INVALID_QUERY"})
    ml = app.state.cinema_ml
    if not getattr(ml, "available", False):
        return JSONResponse(status_code=503, content={"code": "ML_UNAVAILABLE"})
    vectors = ml.embed_texts([text])
    vector = vectors[0] if isinstance(vectors, list) and vectors else None
    if (
        not isinstance(vector, list)
        or len(vector) != 384
        or not all(isinstance(value, (int, float)) for value in vector)
    ):
        return JSONResponse(status_code=503, content={"code": "EMBEDDING_UNAVAILABLE"})
    return {"embedding": [float(value) for value in vector], "dimensions": 384}


@app.post("/embed-texts")
async def embed_texts(payload: EmbedTextsPayload):
    texts = [str(item).strip() for item in payload.texts]
    if not texts or len(texts) > 64 or any(not item or len(item) > 1200 for item in texts):
        return JSONResponse(status_code=400, content={"code": "INVALID_BATCH"})
    ml = app.state.cinema_ml
    if not getattr(ml, "available", False):
        return JSONResponse(status_code=503, content={"code": "ML_UNAVAILABLE"})
    vectors = ml.embed_texts(texts)
    valid = (
        isinstance(vectors, list)
        and len(vectors) == len(texts)
        and all(
            isinstance(vector, list)
            and len(vector) == 384
            and all(isinstance(value, (int, float)) for value in vector)
            for vector in vectors
        )
    )
    if not valid:
        return JSONResponse(status_code=503, content={"code": "EMBEDDING_UNAVAILABLE"})
    model = getattr(getattr(ml, "config", None), "embedding_model", None)
    return {
        "embeddings": [[float(value) for value in vector] for vector in vectors],
        "dimensions": 384,
        "model": model,
    }


@app.post("/person-search")
async def person_search(payload: PersonSearchPayload):
    credits = [Credit(**item) for item in payload.credits]

    async def resolve(_name, _role):
        return {"person": payload.person, "credits": credits, "verified": True}

    async def no_availability(_credit):
        return None

    return await run_person_search(payload.intent, resolve, no_availability)
