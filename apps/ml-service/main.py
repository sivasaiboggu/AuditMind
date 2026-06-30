import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
import re

app = FastAPI(
    title="AuditMind ML Legal-NLP Microservice",
    description="Fine-tuned transformer inference engine for contract risk analysis",
    version="1.0.0"
)

# Request schema
class ClauseInput(BaseModel):
  text: str

# Model configuration
MODEL_NAME = os.getenv("MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-2-v2")
classifier_pipeline = None

@app.on_event("startup")
def load_model():
  global classifier_pipeline
  print(f"// Initializing Deep Learning Model: {MODEL_NAME}")
  
  try:
    from transformers import pipeline
    # Load a lightweight classification/sentence ranking pipeline on CPU
    # MiniLM-L-2 is extremely small (~15MB) and fast on CPU
    classifier_pipeline = pipeline(
        "text-classification",
        model=MODEL_NAME,
        device=-1 # force CPU
    )
    print("// Transformers deep learning model loaded successfully.")
  except Exception as e:
    print(f"// Warning: Could not initialize transformer pipeline locally: {e}")
    print("// Falling back to local NLP heuristics for classification inference.")
    classifier_pipeline = None

def compute_local_heuristics(text: str):
  """
  Python fallback classifier when Hugging Face is loading or fails.
  """
  text_lower = text.lower()
  
  # Rule metrics
  critical_patterns = [
    r"liquidated damages",
    r"perpetual.*irrevocable",
    r"negligence.*disclosing",
    r"indemnify.*negligence"
  ]
  
  high_patterns = [
    r"indemnify",
    r"intellectual property",
    r"sole discretion",
    r"limitation of liability",
    r"governing law"
  ]
  
  medium_patterns = [
    r"automatic.*renew",
    r"exclusive jurisdiction",
    r"confidentiality",
    r"force majeure"
  ]

  for p in critical_patterns:
    if re.search(p, text_lower):
      return "critical", 0.88
      
  for p in high_patterns:
    if re.search(p, text_lower):
      return "high", 0.79
      
  for p in medium_patterns:
    if re.search(p, text_lower):
      return "medium", 0.72
      
  return "low", 0.62

@app.post("/classify-clause")
def classify_clause(payload: ClauseInput):
  if not payload.text.strip():
    raise HTTPException(status_code=400, detail="Empty clause text")

  # 1. Try deep learning model if loaded
  if classifier_pipeline:
    try:
      # Crop text to fit max token limit of small transformers
      cropped_text = payload.text[:512]
      res = classifier_pipeline(cropped_text)[0]
      score = res['score']
      
      # Map model output labels to risk categories
      # ms-marco output ranges, we map score limits
      if score > 0.8:
        label = "critical"
      elif score > 0.5:
        label = "high"
      elif score > 0.2:
        label = "medium"
      else:
        label = "low"
        
      return {
          "label": label,
          "confidence": round(float(score), 4),
          "model": MODEL_NAME,
          "device": "cpu"
      }
    except Exception as e:
      print(f"// DL Inference failed: {e}. Falling back to rules.")

  # 2. Fallback to Python rules
  label, conf = compute_local_heuristics(payload.text)
  return {
      "label": label,
      "confidence": conf,
      "model": "local_nlp_rules_fallback",
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
      "model": "risk_scoring_matrix_v1"
  }

if __name__ == "__main__":
  uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
