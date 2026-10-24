"""Uncalibrated review rules, not legal advice or trained-model probabilities."""
import re
import math

RISK_LABELS = {"low", "medium", "high", "critical"}

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

def validated_risk_prediction(result):
    """Never turn generic model confidence or LABEL_0 into legal risk."""
    if not isinstance(result, list) or not result or not isinstance(result[0], dict):
        raise ValueError("Missing risk prediction")
    row = result[0]
    label = row.get("label")
    score = row.get("score")
    if label not in RISK_LABELS:
        raise ValueError("Model must return an explicit legal-risk label")
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        raise ValueError("Invalid model score")
    if not math.isfinite(score) or not 0 <= score <= 1:
        raise ValueError("Model score outside [0, 1]")
    return label, round(float(score), 4)
