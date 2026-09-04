from fastapi.testclient import TestClient
from moviebrain.app import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["status"] == "ok"
    assert body["service"] == "moviefinder-python"


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


def test_ready_reports_safe_configuration_state(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "super-secret")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "database-secret")
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["subsystems"]["python"]["status"] == "ready"
    assert body["subsystems"]["database"]["status"] == "configured"
    assert body["subsystems"]["ai"]["status"] == "configured"
    serialized = str(body)
    assert "super-secret" not in serialized
    assert "database-secret" not in serialized


def test_ready_handles_unconfigured_optional_services():
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["subsystems"]["python"]["status"] == "ready"
