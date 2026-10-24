import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from risk_rules import compute_local_heuristics, validated_risk_prediction

app = FastAPI(
    title="AuditMind ML Legal-NLP Microservice",
    description="Contract review rules with optional explicit-label risk model inference",
    version="1.0.0"
)

# Request schema
class ClauseInput(BaseModel):
  text: str

# No default relevance/base model can establish legal risk. Model inference is
# opt-in and local-only, and needs a reviewed model with all four risk labels.
MODEL_NAME = os.getenv("MODEL_NAME", "").strip()
classifier_pipeline = None

@app.on_event("startup")
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
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, local_files_only=True)
    classifier_pipeline = pipeline("text-classification", model=model, tokenizer=tokenizer, device=-1)
  except Exception:
    # Do not leak paths/provider errors. Rule provenance is returned below.
    classifier_pipeline = None

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
  
  final_score = min(100, base + length_mod)
  return {
      "score": final_score,
      "model": "risk_scoring_matrix_v1",
      "method": "heuristic_review_rules",
      "calibrated": False
  }

if __name__ == "__main__":
  uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
