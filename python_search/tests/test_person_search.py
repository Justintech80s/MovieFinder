import asyncio
from moviebrain.models import Credit
from moviebrain.person_search import run_person_search


def test_streaming_search_checks_each_unique_movie_once():
    calls = []

    async def resolve(name, role):
        return {"person": {"id": "Q3772", "name": name}, "verified": True, "credits": [
            Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="director"),
            Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="writer"),
            Credit(work_id="Q2", title="Jackie Brown", year=1997, role="director"),
        ]}

    async def availability(credit):
        calls.append(credit.title)
        return {"offers": [{"provider": "Example", "type": "FLATRATE"}]}

    result = asyncio.run(run_person_search(
        {"personName": "Quentin Tarantino", "role": "all", "filmographyView": "available"},
        resolve,
        availability,
    ))
    assert calls == ["Pulp Fiction", "Jackie Brown"]
    assert len(result["filmography"]) == 2
    assert result["filmography"][0]["roles"] == ["director", "writer"]


def test_complete_search_does_not_call_availability():
    async def resolve(name, role):
        return {"person": {"id": "Q1", "name": name}, "verified": True, "credits": [Credit(title="Film", year=2000, role="cast")]}

    async def availability(_credit):
        raise AssertionError("availability should not be called")

    result = asyncio.run(run_person_search(
        {"personName": "Example", "role": "all", "filmographyView": "complete"}, resolve, availability
    ))
    assert len(result["results"]) == 1
    assert result["availabilitySummary"]["unknown"] == 1
