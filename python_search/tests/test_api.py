from fastapi.testclient import TestClient
from moviebrain.app import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_person_search_aggregates_roles_without_frontend_changes():
    response = client.post("/person-search", json={
        "intent": {"personName": "Quentin Tarantino", "role": "all", "filmographyView": "complete"},
        "person": {"id": "Q3772", "name": "Quentin Tarantino"},
        "credits": [
            {"work_id": "Q1", "title": "Pulp Fiction", "year": 1994, "role": "director"},
            {"work_id": "Q1", "title": "Pulp Fiction", "year": 1994, "role": "writer"},
        ]
    })
    assert response.status_code == 200
    body = response.json()
    assert len(body["filmography"]) == 1
    assert body["filmography"][0]["roles"] == ["director", "writer"]
    assert set(["person", "filmography", "results", "availabilitySummary", "verified"]).issubset(body)
