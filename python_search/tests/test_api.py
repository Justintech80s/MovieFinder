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


def test_embed_query_returns_only_a_384_dimension_numeric_vector(monkeypatch):
    class FakeML:
        available = True
        def embed_texts(self, texts):
            assert texts == ["movies like Heat"]
            return [[0.25] * 384]

    monkeypatch.setattr(app.state, "cinema_ml", FakeML(), raising=False)
    response = client.post("/embed-query", json={"text": "movies like Heat"})
    assert response.status_code == 200
    body = response.json()
    assert body["dimensions"] == 384
    assert len(body["embedding"]) == 384
    assert all(isinstance(value, (int, float)) for value in body["embedding"])


def test_embed_query_fails_safely_when_ml_is_disabled(monkeypatch):
    class DisabledML:
        available = False
        def embed_texts(self, _texts):
            raise AssertionError("disabled ML must not execute")

    monkeypatch.setattr(app.state, "cinema_ml", DisabledML(), raising=False)
    response = client.post("/embed-query", json={"text": "Heat"})
    assert response.status_code == 503
    assert response.json()["code"] == "ML_UNAVAILABLE"


def test_embed_query_rejects_wrong_embedding_dimensions(monkeypatch):
    class WrongSizeML:
        available = True
        def embed_texts(self, _texts):
            return [[0.1] * 12]

    monkeypatch.setattr(app.state, "cinema_ml", WrongSizeML(), raising=False)
    response = client.post("/embed-query", json={"text": "Heat"})
    assert response.status_code == 503
    assert response.json()["code"] == "EMBEDDING_UNAVAILABLE"


def test_embed_texts_returns_validated_batch_and_model(monkeypatch):
    class FakeML:
        available = True
        config = type("Config", (), {"embedding_model": "test-embedding-model"})()
        def embed_texts(self, texts):
            assert texts == ["Heat (1995)", "Thief (1981)"]
            return [[0.1] * 384, [0.2] * 384]

    monkeypatch.setattr(app.state, "cinema_ml", FakeML(), raising=False)
    response = client.post("/embed-texts", json={"texts": ["Heat (1995)", "Thief (1981)"]})
    assert response.status_code == 200
    body = response.json()
    assert body["dimensions"] == 384
    assert body["model"] == "test-embedding-model"
    assert len(body["embeddings"]) == 2
    assert all(len(vector) == 384 for vector in body["embeddings"])


def test_embed_texts_rejects_oversized_batches(monkeypatch):
    class FakeML:
        available = True
        config = type("Config", (), {"embedding_model": "test"})()

    monkeypatch.setattr(app.state, "cinema_ml", FakeML(), raising=False)
    response = client.post("/embed-texts", json={"texts": ["x"] * 65})
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_BATCH"
