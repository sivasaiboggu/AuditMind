import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from fastapi.testclient import TestClient
    import main
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

@unittest.skipUnless(HAS_FASTAPI, 'Install fastapi, uvicorn and httpx for service checks')
class ServiceTests(unittest.TestCase):
    def setUp(self):
        main.classifier_pipeline = None
        self.client = TestClient(main.app)

    def test_default_startup_does_not_import_transformers(self):
        with patch.dict(os.environ, {'ENABLE_RISK_MODEL':'false'}), patch.dict(sys.modules, {'transformers':None}):
            main.load_model()
            self.assertIsNone(main.classifier_pipeline)

    def test_empty_clause_rejected(self):
        for route in ['/classify-clause','/risk-score']:
            self.assertEqual(self.client.post(route,json={'text':'  '}).status_code,400)

    def test_rules_disclose_provenance(self):
        data=self.client.post('/classify-clause',json={'text':'ordinary clause'}).json()
        self.assertEqual(data['label'],'low')
        self.assertEqual(data['method'],'heuristic_review_rules')
        self.assertFalse(data['calibrated'])

    def test_high_relevance_confidence_cannot_become_critical_risk(self):
        main.classifier_pipeline=lambda *a,**k:[{'label':'LABEL_0','score':.999}]
        data=self.client.post('/classify-clause',json={'text':'ordinary clause'}).json()
        self.assertEqual(data['label'],'low')
        self.assertEqual(data['model'],'local_nlp_rules_fallback')

    def test_named_risk_prediction_preserves_low_label_and_zero(self):
        main.classifier_pipeline=lambda *a,**k:[{'label':'low','score':0}]
        data=self.client.post('/classify-clause',json={'text':'ordinary clause'}).json()
        self.assertEqual(data['label'],'low')
        self.assertEqual(data['confidence'],0)
        self.assertEqual(data['method'],'configured_risk_model')

    def test_risk_score_discloses_heuristic_method(self):
        data=self.client.post('/risk-score',json={'text':'ordinary clause'}).json()
        self.assertTrue(0<=data['score']<=100)
        self.assertFalse(data['calibrated'])
        self.assertEqual(data['method'],'heuristic_review_rules')
