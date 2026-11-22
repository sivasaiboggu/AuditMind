import os
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from risk_rules import compute_local_heuristics, count_heuristic_matches, matched_terms, validated_risk_prediction


# Single source of truth for the ML service version; keep in sync with the
# monorepo release in the root package.json.
APP_VERSION = "1.0.7"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # @app.on_event("startup") is deprecated; the lifespan hook is the
    # supported way to load the optional model exactly once.
    load_model()
    yield


app = FastAPI(
    title="AuditMind ML Legal-NLP Microservice",
    description="Contract review rules with optional explicit-label risk model inference",
    version=APP_VERSION,
    lifespan=lifespan,
)

# Clauses are contract paragraphs, not whole documents. Without a bound, one
# oversized request body keeps the single-worker regex/model path busy, so cap
# the field well above any real clause. Oversized input is rejected with 422;
# callers then use their own reviewed fallback rather than an unbounded scan.
MAX_CLAUSE_CHARS = 20000

# Request schema
class ClauseInput(BaseModel):
  text: str = Field(max_length=MAX_CLAUSE_CHARS)

# No default relevance/base model can establish legal risk. Model inference is
# opt-in and local-only, and needs a reviewed model with all four risk labels.
MODEL_NAME = os.getenv("MODEL_NAME", "").strip()
classifier_pipeline = None


def load_model():
  global classifier_pipeline
  classifier_pipeline = None
  if os.getenv("ENABLE_RISK_MODEL", "false").lower() != "true" or not MODEL_NAME:
    return
  try:
    from transformers import AutoConfig, AutoTokenizer, AutoModelForSequenceClassification, pipeline
    config = AutoConfig.from_pretrained(MODEL_NAME, local_files_only=True)
    labels = set(config.id2label.values())
    if labels != {"low", "medium", "high", "critical"}:
      raise ValueError("Model config must declare the four explicit legal-risk labels")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=True)
    model, loading = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, local_files_only=True, output_loading_info=True
    )
    if loading.get("missing_keys") or loading.get("mismatched_keys"):
      raise ValueError("Incomplete risk-model weights")
    classifier_pipeline = pipeline("text-classification", model=model, tokenizer=tokenizer, device=-1)
  except Exception:
    # Do not leak paths/provider errors. Rule provenance is returned below.
    classifier_pipeline = None


@app.get("/health")
def health():
  return {
      "status": "healthy",
      "service": "AuditMind ML service",
      "version": APP_VERSION,
      "model": MODEL_NAME or None,
      "model_loaded": classifier_pipeline is not None,
      "method": "configured_risk_model" if classifier_pipeline is not None else "heuristic_review_rules",
      "calibrated": False,
  }


@app.post("/classify-clause")
def classify_clause(payload: ClauseInput):
  if not payload.text.strip():
    raise HTTPException(status_code=400, detail="Empty clause text")

  # 1. Try deep learning model if loaded
  if classifier_pipeline:
    try:
      label, score = validated_risk_prediction(
          classifier_pipeline(payload.text, truncation=True, max_length=512)
      )
      return {
          "label": label,
          "confidence": score,
          "model": MODEL_NAME,
          "method": "configured_risk_model",
          "calibrated": False,
          "device": "cpu"
      }
    except Exception:
      pass

  # 2. Fallback to Python rules
  label, conf = compute_local_heuristics(payload.text)
  return {
      "label": label,
      "confidence": conf,
      "model": "local_nlp_rules_fallback",
      "method": "heuristic_review_rules",
      "calibrated": False,
      # The exact words that earned the tier — the evidence behind the
      # score, not the regex that matched. Empty when no rule fired.
      "matched": matched_terms(payload.text),
      "device": "cpu"
  }

@app.post("/risk-score")
def risk_score(payload: ClauseInput):
  if not payload.text.strip():
    raise HTTPException(status_code=400, detail="Empty clause text")

  label, conf = compute_local_heuristics(payload.text)

  # Base scores
  base_scores = {
      "critical": 82,
      "high": 64,
      "medium": 45,
      "low": 18
  }

  base = base_scores.get(label, 15)
  # Adjust slightly based on word count/complexity
  length_mod = min(15, len(payload.text.split()) // 8)
  # A clause tripping several independent review patterns deserves a higher
  # review priority than a clause tripping one: +3 per extra distinct
  # signal, capped at +9. Mirrors the TypeScript fallback in ml.ts exactly.
  signals = count_heuristic_matches(payload.text)
  signal_mod = 3 * min(3, max(0, signals - 1)) if signals > 0 else 0

  final_score = min(100, base + length_mod + signal_mod)
  return {
      "score": final_score,
      "signals": signals,
      "matched": matched_terms(payload.text),
      "model": "risk_scoring_matrix_v1",
      "method": "heuristic_review_rules",
      "calibrated": False
  }

if __name__ == "__main__":
  uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
