import asyncio
from dataclasses import asdict
from .filmography import aggregate_credits


def _record(credit, availability=None, error=None):
    data = asdict(credit)
    offers = list((availability or {}).get("offers") or []) if not error else []
    status = "UNKNOWN" if error else ("NOW" if offers else "UNAVAILABLE")
    return {
        "id": (availability or {}).get("id") or credit.work_id,
        "workId": credit.work_id,
        "title": (availability or {}).get("title") or credit.title,
        "year": (availability or {}).get("year", credit.year),
        "mediaType": (availability or {}).get("mediaType", "MOVIE"),
        "role": credit.role,
        "roles": list(credit.roles),
        "personCredit": data,
        "offers": offers,
        "availabilityStatus": status,
        "availabilityError": str(error) if error else None,
    }


async def run_person_search(intent, resolve_credits, lookup_availability, concurrency=6):
    resolved = await resolve_credits(intent.get("personName"), intent.get("role"))
    if not resolved or not resolved.get("person"):
        return {"person": None, "filmography": [], "results": [], "availabilitySummary": {"total": 0, "availableNow": 0, "unavailable": 0, "unknown": 0}, "verified": False}

    credits = aggregate_credits(list(resolved.get("credits") or []))
    complete = intent.get("filmographyView") == "complete"
    if complete:
        records = [_record(c, error="availability not requested") for c in credits]
    else:
        semaphore = asyncio.Semaphore(max(1, int(concurrency)))

        async def check(credit):
            async with semaphore:
                try:
                    return _record(credit, await lookup_availability(credit))
                except Exception as exc:
                    return _record(credit, error=exc)

        records = await asyncio.gather(*(check(c) for c in credits))

    summary = {
        "total": len(records),
        "availableNow": sum(r["availabilityStatus"] == "NOW" for r in records),
        "unavailable": sum(r["availabilityStatus"] == "UNAVAILABLE" for r in records),
        "unknown": sum(r["availabilityStatus"] == "UNKNOWN" for r in records),
    }
    results = [r for r in records if r["availabilityStatus"] == "NOW"] if intent.get("filmographyView") == "available" else records
    return {"person": resolved["person"], "filmography": records, "results": results, "availabilitySummary": summary, "verified": resolved.get("verified", True)}
