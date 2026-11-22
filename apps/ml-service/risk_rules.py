"""Uncalibrated review rules, not legal advice or trained-model probabilities."""
import re
import math

RISK_LABELS = {"low", "medium", "high", "critical"}

# Each rule is (pattern, label, confidence, probes). The pattern decides the
# tier; the probes are the exact words the rule fired on, returned to the
# caller as evidence — the clause text itself, never the regex source.
#
# Two-part patterns are bounded to .{0,200}: an unbounded ".*" let any two
# words co-occurring anywhere in a 20,000-char clause escalate it to
# critical, even when they belong to unrelated sentences. 200 chars covers
# genuinely wrapped phrasing while keeping distant co-occurrence out.
#
# Word-family patterns (indemnif\\w*, confidential, terminat\\w*) cover the
# inflections the bare stems missed: "indemnification", "confidential
# information", "terminate without notice".
#
# Every pattern starts at a word boundary (\\b): substring matching counted
# "determination" as "terminate ... without notice" and would count any
# longer word containing a stem. The confidential rule also refuses a
# "non-" prefix, so a clause that says information is non-confidential is
# not flagged as a confidentiality risk. The TypeScript offline fallback in
# apps/api/src/services/ml.ts mirrors this table exactly; edit both.
RULES = [
    (r"\bliquidated damages", "critical", 0.88, [r"\bliquidated damages"]),
    (r"\bperpetual.{0,200}\birrevocable", "critical", 0.88,
     [r"\bperpetual\w*", r"\birrevocable\w*"]),
    (r"\bnegligence.{0,200}\bdisclosing", "critical", 0.88,
     [r"\bnegligence\w*", r"\bdisclosing\w*"]),
    (r"\bindemnif\w*.{0,200}\bnegligence", "critical", 0.88,
     [r"\bindemnif\w*", r"\bnegligence\w*"]),
    (r"\bindemnif\w*", "high", 0.79, [r"\bindemnif\w*"]),
    (r"\bintellectual property", "high", 0.79, [r"\bintellectual property"]),
    (r"\bsole discretion", "high", 0.79, [r"\bsole discretion"]),
    (r"\blimitation of liability", "high", 0.79, [r"\blimitation of liability"]),
    (r"\bgoverning law", "high", 0.79, [r"\bgoverning law"]),
    (r"\bunlimited liability", "high", 0.79, [r"\bunlimited liability"]),
    (r"\bnon[-\s]?compete", "high", 0.79, [r"\bnon[-\s]?compete\w*"]),
    (r"\bautomatic.{0,200}\brenew", "medium", 0.72,
     [r"\bautomatic\w*", r"\brenew\w*"]),
    (r"\bauto[-\s]?renew", "medium", 0.72, [r"\bauto[-\s]?renew\w*"]),
    (r"\bexclusive jurisdiction", "medium", 0.72, [r"\bexclusive jurisdiction"]),
    (r"(?<!non[-\s])\bconfidential", "medium", 0.72, [r"\bconfidential\w*"]),
    (r"\bforce[-\s]?majeure", "medium", 0.72, [r"\bforce[-\s]?majeure\w*"]),
    (r"\bterminat\w*.{0,40}\bwithout notice", "medium", 0.72,
     [r"\bterminat\w*", r"\bwithout notice"]),
]

# Backwards-compatible names for the old flat pattern lists.
CRITICAL_PATTERNS = [p for p, label, _, _ in RULES if label == "critical"]
HIGH_PATTERNS = [p for p, label, _, _ in RULES if label == "high"]
MEDIUM_PATTERNS = [p for p, label, _, _ in RULES if label == "medium"]
ALL_PATTERNS = [p for p, _, _, _ in RULES]


def _normalize(text: str) -> str:
    if not isinstance(text, str):
        raise ValueError("Clause text must be a string")
    if not text.strip():
        raise ValueError("Empty clause text")
    # Contract clauses routinely wrap across lines; "." never matches "\n",
    # so two-part patterns would silently miss. Collapse all whitespace runs
    # (newlines, tabs, repeated spaces) before matching.
    return re.sub(r"\s+", " ", text.lower())


def match_review_patterns(text: str):
    """One entry per matched review rule, in tier order, listing the exact
    words in the clause that fired it. The probes run on the same
    normalized text as the patterns, so a probe can only fire for a rule
    that already matched. Returns a list of word lists, e.g.
    [['indemnify', 'negligence']]."""
    text_lower = _normalize(text)
    matched = []
    for pattern, _label, _confidence, probes in RULES:
        if re.search(pattern, text_lower):
            terms = []
            for probe in probes:
                found = re.search(probe, text_lower)
                if found:
                    terms.append(found.group(0))
            matched.append(terms)
    return matched


def matched_terms(text: str) -> list:
    """The exact words that earned the clause its risk tier, de-duplicated
    in first-match order. Empty when no rule fired."""
    seen = set()
    terms = []
    for group in match_review_patterns(text):
        for term in group:
            if term not in seen:
                seen.add(term)
                terms.append(term)
    return terms


def compute_local_heuristics(text: str):
    """
    Python fallback classifier when Hugging Face is loading or fails.
    """
    text_lower = _normalize(text)

    for pattern, label, confidence, _probes in RULES:
        if re.search(pattern, text_lower):
            return label, confidence

    return "low", 0.62


def count_heuristic_matches(text: str) -> int:
    """Distinct review patterns matched; drives the risk-score signal
    modifier in main.py. Mirrors the TypeScript fallback's count."""
    return len(match_review_patterns(text))


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
