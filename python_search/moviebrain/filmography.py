import re
from .models import AggregatedCredit, Credit

ROLE_ORDER = ("director", "writer", "producer", "cast")


def _role_key(role: str) -> tuple[int, str]:
    try:
        return (ROLE_ORDER.index(role), role)
    except ValueError:
        return (len(ROLE_ORDER), role)


def _work_key(credit: Credit) -> str:
    if credit.work_id:
        return credit.work_id
    title = re.sub(r"[^a-z0-9]+", " ", credit.title.lower()).strip()
    return f"{title}:{credit.year or ''}"


def aggregate_credits(credits: list[Credit]) -> list[AggregatedCredit]:
    by_work: dict[str, AggregatedCredit] = {}
    for credit in credits:
        key = _work_key(credit)
        if key not in by_work:
            by_work[key] = AggregatedCredit(
                work_id=credit.work_id,
                title=credit.title,
                year=credit.year,
                role=credit.role,
                roles=[],
            )
        current = by_work[key]
        if credit.role and credit.role not in current.roles:
            current.roles.append(credit.role)
        current.roles.sort(key=_role_key)
        current.role = current.roles[0] if current.roles else current.role
    return list(by_work.values())
