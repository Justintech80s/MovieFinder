from dataclasses import dataclass
import os
from typing import Any, Callable, Optional


@dataclass(frozen=True)
class MLConfig:
    enabled: bool
    embedding_model: str
    classifier_model: str
    ner_model: str
    rerank_model: str


def _flag(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def read_ml_config(env=None) -> MLConfig:
    source = os.environ if env is None else env
    return MLConfig(
        enabled=_flag(source.get("MOVIEFINDER_ML_ENABLED")),
        embedding_model=source.get(
            "MOVIEFINDER_EMBEDDING_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2",
        ),
        classifier_model=source.get(
            "MOVIEFINDER_CLASSIFIER_MODEL",
            "facebook/bart-large-mnli",
        ),
        ner_model=source.get(
            "MOVIEFINDER_NER_MODEL",
            "dslim/bert-base-NER",
        ),
        rerank_model=source.get(
            "MOVIEFINDER_RERANK_MODEL",
            "cross-encoder/ms-marco-MiniLM-L-6-v2",
        ),
    )


class CinemaML:
    def __init__(
        self,
        config: Optional[MLConfig] = None,
        pipeline_loader: Optional[Callable[..., Any]] = None,
    ):
        self.config = config or read_ml_config()
        self._pipeline_loader = pipeline_loader
        self._pipelines = {}
        self._disabled_after_failure = False

    @property
    def available(self) -> bool:
        return bool(self.config.enabled and not self._disabled_after_failure)

    def _loader(self):
        if self._pipeline_loader is not None:
            return self._pipeline_loader
        from transformers import pipeline
        return pipeline

    def _pipeline(self, key: str, task: str, model: str):
        if not self.available:
            return None
        if key in self._pipelines:
            return self._pipelines[key]
        try:
            pipe = self._loader()(task, model=model)
            self._pipelines[key] = pipe
            return pipe
        except Exception:
            self._disabled_after_failure = True
            return None

    def classify_query(self, text: str):
        pipe = self._pipeline("classifier", "zero-shot-classification", self.config.classifier_model)
        if pipe is None:
            return None
        try:
            result = pipe(
                text,
                candidate_labels=[
                    "title_search",
                    "person_search",
                    "recommendation",
                    "streaming_availability",
                    "filmography",
                ],
            )
            labels = result.get("labels") or []
            scores = result.get("scores") or []
            if not labels:
                return None
            return {"label": labels[0], "confidence": scores[0] if scores else None}
        except Exception:
            return None

    def extract_entities(self, text: str):
        pipe = self._pipeline("ner", "token-classification", self.config.ner_model)
        if pipe is None:
            return []
        try:
            return pipe(text, aggregation_strategy="simple") or []
        except Exception:
            return []

    def embed_texts(self, texts):
        items = list(texts or [])
        if not items:
            return []
        pipe = self._pipeline("embeddings", "feature-extraction", self.config.embedding_model)
        if pipe is None:
            return []
        try:
            return pipe(items)
        except Exception:
            return []

    def rerank(self, query: str, items):
        candidates = list(items or [])
        if not candidates:
            return []
        pipe = self._pipeline("rerank", "text-classification", self.config.rerank_model)
        if pipe is None:
            return candidates
        try:
            scored = []
            for index, item in enumerate(candidates):
                title = item.get("title") if isinstance(item, dict) else str(item)
                result = pipe(f"{query} [SEP] {title}")
                score = 0.0
                if isinstance(result, list) and result:
                    score = float(result[0].get("score", 0.0))
                scored.append((score, -index, item))
            scored.sort(reverse=True, key=lambda row: (row[0], row[1]))
            return [row[2] for row in scored]
        except Exception:
            return candidates
