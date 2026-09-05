import os
import pytest

from moviebrain.ml import CinemaML, read_ml_config


def test_ml_config_is_environment_driven_and_disabled_by_default(monkeypatch):
    for key in [
        "MOVIEFINDER_ML_ENABLED",
        "MOVIEFINDER_EMBEDDING_MODEL",
        "MOVIEFINDER_CLASSIFIER_MODEL",
        "MOVIEFINDER_NER_MODEL",
        "MOVIEFINDER_RERANK_MODEL",
    ]:
        monkeypatch.delenv(key, raising=False)

    config = read_ml_config()
    assert config.enabled is False
    assert config.embedding_model
    assert config.classifier_model
    assert config.ner_model
    assert config.rerank_model


def test_ml_config_accepts_model_overrides(monkeypatch):
    monkeypatch.setenv("MOVIEFINDER_ML_ENABLED", "true")
    monkeypatch.setenv("MOVIEFINDER_EMBEDDING_MODEL", "example/embedding")
    monkeypatch.setenv("MOVIEFINDER_CLASSIFIER_MODEL", "example/classifier")
    monkeypatch.setenv("MOVIEFINDER_NER_MODEL", "example/ner")
    monkeypatch.setenv("MOVIEFINDER_RERANK_MODEL", "example/rerank")

    config = read_ml_config()
    assert config.enabled is True
    assert config.embedding_model == "example/embedding"
    assert config.classifier_model == "example/classifier"
    assert config.ner_model == "example/ner"
    assert config.rerank_model == "example/rerank"


def test_ml_adapter_fails_open_when_disabled():
    ml = CinemaML(config=read_ml_config({"MOVIEFINDER_ML_ENABLED": "false"}))
    assert ml.available is False
    assert ml.classify_query("dark 1970s conspiracy thrillers") is None
    assert ml.extract_entities("films directed by Martin Scorsese") == []
    assert ml.embed_texts(["Taxi Driver"]) == []
    assert ml.rerank("crime films", [{"title": "Taxi Driver"}]) == [{"title": "Taxi Driver"}]


def test_ml_adapter_lazy_load_failure_does_not_break_search():
    def broken_loader(*_args, **_kwargs):
        raise RuntimeError("model runtime unavailable")

    ml = CinemaML(
        config=read_ml_config({"MOVIEFINDER_ML_ENABLED": "true"}),
        pipeline_loader=broken_loader,
    )
    assert ml.classify_query("movies like Heat") is None
    assert ml.extract_entities("Martin Scorsese movies") == []
    assert ml.embed_texts(["Heat"]) == []
    assert ml.rerank("crime", [{"title": "Heat"}]) == [{"title": "Heat"}]


def test_embed_texts_mean_pools_token_embeddings_into_sentence_vectors():
    class FakeFeaturePipeline:
        def __call__(self, items):
            assert items == ["Heat"]
            return [[[1.0, 3.0], [3.0, 5.0]]]

    ml = CinemaML(
        config=read_ml_config({"MOVIEFINDER_ML_ENABLED": "true"}),
        pipeline_loader=lambda *_args, **_kwargs: FakeFeaturePipeline(),
    )
    assert ml.embed_texts(["Heat"]) == [[2.0, 4.0]]
