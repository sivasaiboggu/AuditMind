"""Uncalibrated review rules, not legal advice or trained-model probabilities."""
import re
import math

RISK_LABELS = {"low", "medium", "high", "critical"}

# Two-part patterns are bounded to .{0,200}: an unbounded ".*" let any two
# words co-occurring anywhere in a 20,000-char clause escalate it to
# critical, even when they belong to unrelated sentences. 200 chars covers
# genuinely wrapped phrasing while keeping distant co-occurrence out.
# Word-family patterns (indemnif\\w*, confidential, terminat\\w*) cover the
# inflections the bare stems missed: "indemnification", "confidential
# information", "terminate without notice".
CRITICAL_PATTERNS = [
    r"liquidated damages",
    r"perpetual.{0,200}irrevocable",
    r"negligence.{0,200}disclosing",
    r"indemnif\w*.{0,200}negligence",
]

HIGH_PATTERNS = [
    r"indemnif\w*",
    r"intellectual property",
    r"sole discretion",
    r"limitation of liability",
    r"governing law",
    r"unlimited liability",
    r"non[-\s]?compete",
]

MEDIUM_PATTERNS = [
    r"automatic.{0,200}renew",
    r"auto[-\s]?renew",
    r"exclusive jurisdiction",
    r"confidential",
    r"force[-\s]?majeure",
    r"terminat\w*.{0,40}without notice",
]

ALL_PATTERNS = CRITICAL_PATTERNS + HIGH_PATTERNS + MEDIUM_PATTERNS


def _normalize(text: str) -> str:
    if not isinstance(text, str):
        raise ValueError("Clause text must be a string")
    if not text.strip():
        raise ValueError("Empty clause text")
    # Contract clauses routinely wrap across lines; "." never matches "\n",
    # so two-part patterns would silently miss. Collapse all whitespace runs
    # (newlines, tabs, repeated spaces) before matching.
    return re.sub(r"\s+", " ", text.lower())


def compute_local_heuristics(text: str):
    """
    Python fallback classifier when Hugging Face is loading or fails.
    """
    text_lower = _normalize(text)

    for p in CRITICAL_PATTERNS:
        if re.search(p, text_lower):
            return "critical", 0.88

    for p in HIGH_PATTERNS:
        if re.search(p, text_lower):
            return "high", 0.79

    for p in MEDIUM_PATTERNS:
        if re.search(p, text_lower):
            return "medium", 0.72

    return "low", 0.62


def count_heuristic_matches(text: str) -> int:
    """Distinct review patterns matched; drives the risk-score signal
    modifier in main.py. Mirrors the TypeScript fallback's count."""
    text_lower = _normalize(text)
    return sum(1 for p in ALL_PATTERNS if re.search(p, text_lower))


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
