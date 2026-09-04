import os
import pytest

from moviebrain.ml import CinemaML


def test_ml_adapter_defaults_to_disabled_without_model_configuration(monkeypatch):
    monkeypatch.delenv("MOVIEFINDER_EMBEDDING_MODEL", raising=False)
    monkeypatch.delenv("MOVIEFINDER_CLASSIFIER_MODEL", raising=False)
    ml = CinemaML.from_env()
    assert ml.configured is False
    assert ml.status()["embedding"] == "not_configured"


def test_ml_adapter_reads_configurable_model_names_without_loading_them(monkeypatch):
    monkeypatch.setenv("MOVIEFINDER_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    monkeypatch.setenv("MOVIEFINDER_CLASSIFIER_MODEL", "example/classifier")
    ml = CinemaML.from_env()
    assert ml.configured is True
    assert ml.embedding_model_name == "sentence-transformers/all-MiniLM-L6-v2"
    assert ml.classifier_model_name == "example/classifier"
    assert ml.loaded is False


def test_semantic_features_fail_open_when_optional_ml_dependencies_are_unavailable(monkeypatch):
    monkeypatch.setenv("MOVIEFINDER_EMBEDDING_MODEL", "example/embedding")
    ml = CinemaML.from_env(loader=lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("transformers unavailable")))
    assert ml.embed(["crime thriller"]) is None
    assert ml.status()["embedding"] == "unavailable"
