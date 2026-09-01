from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Credit:
    title: str
    year: Optional[int] = None
    role: Optional[str] = None
    work_id: Optional[str] = None


@dataclass
class AggregatedCredit(Credit):
    roles: list[str] = field(default_factory=list)
