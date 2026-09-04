import os


class CinemaML:
    def __init__(self, embedding_model_name=None, classifier_model_name=None, loader=None):
        self.embedding_model_name = embedding_model_name
        self.classifier_model_name = classifier_model_name
        self._loader = loader or self._default_loader
        self._embedding_pipeline = None
        self._embedding_state = "not_configured" if not embedding_model_name else "configured"

    @classmethod
    def from_env(cls, loader=None):
        return cls(
            embedding_model_name=os.getenv("MOVIEFINDER_EMBEDDING_MODEL") or None,
            classifier_model_name=os.getenv("MOVIEFINDER_CLASSIFIER_MODEL") or None,
            loader=loader,
        )

    @property
    def configured(self):
        return bool(self.embedding_model_name or self.classifier_model_name)

    @property
    def loaded(self):
        return self._embedding_pipeline is not None

    @staticmethod
    def _default_loader(task, model):
        from transformers import pipeline
        return pipeline(task, model=model)

    def embed(self, texts):
        if not self.embedding_model_name:
            return None
        try:
            if self._embedding_pipeline is None:
                self._embedding_pipeline = self._loader(
                    "feature-extraction", self.embedding_model_name
                )
            self._embedding_state = "ready"
            return self._embedding_pipeline(list(texts))
        except (ImportError, OSError, RuntimeError, ValueError):
            self._embedding_state = "unavailable"
            self._embedding_pipeline = None
            return None

    def status(self):
        return {
            "configured": self.configured,
            "embedding": self._embedding_state,
            "classifier": "configured" if self.classifier_model_name else "not_configured",
            "loaded": self.loaded,
        }
