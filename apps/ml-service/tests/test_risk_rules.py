import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from risk_rules import compute_local_heuristics, validated_risk_prediction

# One battery, two implementations. The TypeScript offline fallback test in
# apps/api/tests/ml-boundary.test.mjs loads the same file; tier or confidence
# edits that only land on one side fail here.
HEURISTIC_BATTERY = json.loads(
    (Path(__file__).resolve().parents[3] / 'fixtures' / 'heuristic-clauses.json').read_text()
)['clauses']

class RiskBoundaryTests(unittest.TestCase):
    def test_explicit_risk_label_not_confidence_threshold(self):
        self.assertEqual(validated_risk_prediction([{'label':'low','score':0.99}]), ('low',0.99))
        self.assertEqual(validated_risk_prediction([{'label':'critical','score':0}]), ('critical',0))

    def test_generic_labels_and_relevance_rejected(self):
        for label in ['LABEL_0', 'LABEL_1', 'relevant', 'positive', '', None]:
            with self.subTest(label=label), self.assertRaises(ValueError):
                validated_risk_prediction([{'label':label,'score':0.99}])

    def test_invalid_score_rejected(self):
        for score in [None, True, '0.9', float('nan'), float('inf'), -0.1, 1.1]:
            with self.subTest(score=score), self.assertRaises(ValueError):
                validated_risk_prediction([{'label':'low','score':score}])

    def test_malformed_response_rejected(self):
        for result in [None, {}, [], ['low'], [None]]:
            with self.subTest(result=result), self.assertRaises(ValueError):
                validated_risk_prediction(result)

    def test_multiline_and_tabbed_clause_phrases_still_match(self):
        # "." does not cross newlines; wrapped contract text must not downgrade risk.
        self.assertEqual(compute_local_heuristics('shall indemnify the other party for any\nnegligence of its officers')[0], 'critical')
        self.assertEqual(compute_local_heuristics('this agreement shall automatic\nrenew each year')[0], 'medium')
        self.assertEqual(compute_local_heuristics('perpetual\tand irrevocable license')[0], 'critical')

    def test_service_rules_match_the_api_offline_fallback_battery(self):
        # The same shared battery runs against the TypeScript fallback in
        # apps/api/tests/ml-boundary.test.mjs; both paths must agree exactly.
        for clause in HEURISTIC_BATTERY:
            with self.subTest(text=clause['text']):
                self.assertEqual(
                    compute_local_heuristics(clause['text']),
                    (clause['label'], clause['confidence'])
                )

    def test_rules_still_available_without_ml_dependencies(self):
        self.assertEqual(compute_local_heuristics('ordinary delivery clause')[0], 'low')
        self.assertEqual(compute_local_heuristics('indemnify for negligence')[0], 'critical')
        self.assertEqual(compute_local_heuristics('confidentiality')[0], 'medium')

    def test_empty_and_non_string_input_rejected_not_low_risk(self):
        for bad in ['', '   ', None, 123, b'indemnify']:
            with self.subTest(text=bad), self.assertRaises(ValueError):
                compute_local_heuristics(bad)

    def test_word_family_inflections_match(self):
        self.assertEqual(compute_local_heuristics('indemnification obligations of the parties')[0], 'high')
        self.assertEqual(compute_local_heuristics('confidential information must not be disclosed')[0], 'medium')
        self.assertEqual(compute_local_heuristics('the company may terminate this agreement without notice')[0], 'medium')

    def test_hyphenated_variants_match(self):
        self.assertEqual(compute_local_heuristics('this agreement shall auto-renew each year')[0], 'medium')
        self.assertEqual(compute_local_heuristics('the licence shall auto renew each year')[0], 'medium')
        self.assertEqual(compute_local_heuristics('force-majeure event')[0], 'medium')
        self.assertEqual(compute_local_heuristics('a non-compete for two years')[0], 'high')
        self.assertEqual(compute_local_heuristics('a non compete clause')[0], 'high')

    def test_unlimited_liability_is_high(self):
        self.assertEqual(compute_local_heuristics('unlimited liability for all losses')[0], 'high')

    def test_distant_cooccurrence_does_not_escalate(self):
        # "perpetual" and "irrevocable" in unrelated sentences of one long
        # clause must not make it critical; the two-part bound is 200 chars.
        far = 'perpetual license ' + 'filler ' * 40 + 'irrevocable terms'
        self.assertEqual(compute_local_heuristics(far)[0], 'low')
        near = 'perpetual license with an irrevocable grant'
        self.assertEqual(compute_local_heuristics(near)[0], 'critical')

    def test_count_heuristic_matches_counts_distinct_patterns(self):
        from risk_rules import count_heuristic_matches
        self.assertEqual(count_heuristic_matches('ordinary delivery clause'), 0)
        self.assertEqual(count_heuristic_matches('indemnify sole discretion governing law'), 3)
        # 'indemnify for negligence' trips both the critical two-part rule
        # and the bare indemnity rule: two distinct signals.
        self.assertEqual(count_heuristic_matches('indemnify for negligence'), 2)

if __name__ == '__main__':
    unittest.main()
