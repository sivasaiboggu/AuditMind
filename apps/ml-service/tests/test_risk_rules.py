import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from risk_rules import compute_local_heuristics, validated_risk_prediction

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

    def test_rules_still_available_without_ml_dependencies(self):
        self.assertEqual(compute_local_heuristics('ordinary delivery clause')[0], 'low')
        self.assertEqual(compute_local_heuristics('indemnify for negligence')[0], 'critical')
        self.assertEqual(compute_local_heuristics('confidentiality')[0], 'medium')

if __name__ == '__main__':
    unittest.main()
