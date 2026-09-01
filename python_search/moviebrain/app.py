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
    return {"ok": True}


@app.post("/person-search")
async def person_search(payload: PersonSearchPayload):
    credits = [Credit(**item) for item in payload.credits]

    async def resolve(_name, _role):
        return {"person": payload.person, "credits": credits, "verified": True}

    async def no_availability(_credit):
        return None

    return await run_person_search(payload.intent, resolve, no_availability)
