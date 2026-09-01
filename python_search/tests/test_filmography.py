from moviebrain.filmography import aggregate_credits
from moviebrain.models import Credit


def test_merges_same_work_across_roles():
    credits = [
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="cast"),
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="director"),
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="writer"),
    ]
    merged = aggregate_credits(credits)
    assert len(merged) == 1
    assert merged[0].roles == ["director", "writer", "cast"]
    assert merged[0].role == "director"


def test_falls_back_to_normalized_title_and_year():
    credits = [
        Credit(title="Jackie Brown", year=1997, role="director"),
        Credit(title="Jackie  Brown!", year=1997, role="writer"),
    ]
    merged = aggregate_credits(credits)
    assert len(merged) == 1
    assert merged[0].roles == ["director", "writer"]


def test_same_title_different_year_stays_distinct():
    credits = [
        Credit(title="Example", year=1990, role="cast"),
        Credit(title="Example", year=2020, role="cast"),
    ]
    assert len(aggregate_credits(credits)) == 2
