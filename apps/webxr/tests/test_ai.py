import base64
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import ai_verifier as ai
import server
from progression import CheckpointGate
from test_tester import scene, BOXES


def response(observation=None):
    observation=observation or {'A':'goose','B':'fox','C':'square','clear_view':True,'evidence':'Three readable destinations.'}
    return {'status':'completed','usage':{'input_tokens':4000,'output_tokens':100},
            'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(observation)}]}]}


class AITests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'budget.db'
        self.budget=ai.Budget(self.path)
        self.key=patch.object(ai,'read_key',return_value='test-key-never-sent');self.key.start()

    def tearDown(self):
        self.key.stop();self.temp.cleanup()

    def test_persistent_budget_cannot_reset_on_restart(self):
        with patch.object(ai,'MAX_CALLS',1):
            rid=self.budget.reserve('first');self.budget.finish(rid,'complete')
            with self.assertRaisesRegex(ai.AIError,'exhausted'):ai.Budget(self.path).reserve('second')

    def test_concurrent_reservations_admit_one_only(self):
        outcomes=[];barrier=threading.Barrier(5)
        def attempt(i):
            barrier.wait()
            try:self.budget.reserve(str(i));outcomes.append('admitted')
            except ai.AIError:outcomes.append('blocked')
        threads=[threading.Thread(target=attempt,args=(i,)) for i in range(5)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(outcomes.count('admitted'),1)

    def test_cooldown_and_duplicate_rejection(self):
        with patch.object(ai.time,'time',return_value=100):
            rid=self.budget.reserve('same');self.budget.finish(rid,'complete')
            with self.assertRaisesRegex(ai.AIError,'cooldown'):self.budget.reserve('new')
        with patch.object(ai.time,'time',return_value=120):
            with self.assertRaisesRegex(ai.AIError,'already submitted'):self.budget.reserve('same')

    def test_timeout_is_charged_once_without_retry(self):
        calls=[]
        def transport(*args):calls.append(1);raise TimeoutError('never disclose transport detail')
        with self.assertRaisesRegex(ai.AIError,'timed out'):ai.inspect(scene(),scene(),BOXES,self.budget,transport)
        self.assertEqual(len(calls),1)
        self.assertEqual(self.budget.status()['reserved_usd'],.02)
        with self.assertRaises(ai.AIError):self.budget.reserve('next')

    def test_authentication_error_pauses_ai(self):
        def transport(*args):raise urllib.error.HTTPError('test',401,'sensitive body',{},None)
        with self.assertRaisesRegex(ai.AIError,'HTTP 401'):ai.inspect(scene(),scene(),BOXES,self.budget,transport)
        self.assertTrue(self.budget.status()['blocked'])
        with self.assertRaisesRegex(ai.AIError,'paused'):self.budget.reserve('next')

    def test_bounded_payload_no_tools_and_usage_logged(self):
        def transport(payload,key):
            self.assertEqual(payload['model'],'gpt-5.4-mini')
            self.assertFalse(payload['store'])
            self.assertEqual(payload['max_output_tokens'],700)
            self.assertNotIn('tools',payload)
            self.assertEqual(len(payload['input'][0]['content']),3)
            return response()
        answer=ai.inspect(scene(),scene(),BOXES,self.budget,transport)
        self.assertEqual(answer['verdict'],'pass')
        self.assertAlmostEqual(answer['usage']['estimated_usd'],.00345)

    def test_incomplete_and_refused_never_pass(self):
        for status,output in [('incomplete',[]),('completed',[{'type':'message','content':[{'type':'refusal','refusal':'no'}]}])]:
            with self.subTest(status=status):
                budget=ai.Budget(Path(self.temp.name)/(status+'.db'))
                with self.assertRaises(ai.AIError):ai.inspect(scene(),scene(),BOXES,budget,lambda *a:{'status':status,'output':output})
                self.assertEqual(budget.status()['calls'],1)

    def test_model_cannot_force_pass_when_wrong_occluded_or_duplicate(self):
        for values,clear,expected in [(['square','fox','goose'],True,'fail'),(['goose','fox','square'],False,'unknown'),(['goose','goose','square'],True,'unknown'),(['empty','fox','square'],True,'fail'),(['unknown','fox','square'],True,'unknown')]:
            obs=dict(zip(['A','B','C'],values));obs.update(clear_view=clear,evidence='test')
            self.assertEqual(ai.interpret(obs)['verdict'],expected)

    def test_invalid_types_fail_closed(self):
        with self.assertRaises(ai.AIError):ai.interpret({'A':'goose','B':'fox','C':'square','clear_view':'true','evidence':'test'})

    def test_reference_change_during_ai_rejects_response(self):
        with server.LOCK:
            server.STATE.update(reference=scene(),frame=scene(),boxes=BOXES,revision=20,frame_id=1,received=time.monotonic(),result=None)
        def delayed(*args):
            server.STATE['revision']+=1
            return {'request_id':'fake','usage':{},'verdict':'pass'}
        with patch.object(server,'AI_BUDGET',self.budget),patch.object(ai,'inspect',delayed):
            with self.assertRaisesRegex(ValueError,'Reference changed'):server.inspect_ai()
        self.assertIsNone(server.STATE['result'])

    def test_delayed_error_does_not_replace_new_reference_feedback(self):
        server.STATE['revision']=50
        new_result={'revision':51,'verdict':'unknown','message':'new reference'}
        def delayed():
            server.STATE['revision']=51
            server.AI_LATEST=new_result
            raise ValueError('Old request discarded')
        with patch.object(server,'AI_LATEST',None),patch.object(server,'inspect_ai',delayed):
            with self.assertRaises(ValueError):server.run_ai_check()
            self.assertIs(server.AI_LATEST,new_result)

    def test_local_wrong_arrangement_vetoes_ai_false_pass(self):
        with server.LOCK:
            server.STATE.update(reference=scene(),frame=scene((2,1,0)),boxes=BOXES,revision=30,frame_id=3,received=time.monotonic(),result=None)
        answer=ai.interpret({'A':'goose','B':'fox','C':'square','clear_view':True,'evidence':'wrong model assertion'})
        answer.update(request_id='fake',usage={})
        with patch.object(server,'AI_BUDGET',self.budget),patch.object(ai,'inspect',return_value=answer):
            result=server.inspect_ai()
        self.assertEqual(result['verdict'],'unknown')
        self.assertEqual(result['local_comparison']['verdict'],'fail')
        self.assertFalse(result['checkpoint']['evidence_candidate'])

    def test_delayed_pass_is_historical_not_advanceable(self):
        with server.LOCK:
            server.STATE.update(reference=scene(),frame=scene(),boxes=BOXES,revision=21,frame_id=2,received=100.,result=None)
        answer=ai.interpret({'A':'goose','B':'fox','C':'square','clear_view':True,'evidence':'test'})
        answer.update(request_id='fake',usage={})
        with patch.object(server,'AI_BUDGET',self.budget),patch.object(ai,'inspect',return_value=answer),patch.object(server.time,'monotonic',side_effect=[100.,113.]):
            result=server.inspect_ai()
        self.assertEqual(result['verdict'],'unknown')
        self.assertEqual(result['observation_verdict'],'pass')
        self.assertFalse(result['checkpoint']['evidence_candidate'])
        self.assertFalse(result['checkpoint']['automatic_advance'])


class GateTests(unittest.TestCase):
    def test_requires_distinct_fresh_passes(self):
        g=CheckpointGate()
        self.assertFalse(g.observe('step1',1,100,101,'pass'))
        self.assertFalse(g.observe('step1',1,100,102,'pass'))
        self.assertTrue(g.observe('step1',2,110,111,'pass'))
        self.assertFalse(g.observe('step2',3,120,121,'pass'))

    def test_error_unknown_and_stale_clear_evidence(self):
        for verdict,delay in [('fail',1),('unknown',1),('pass',13)]:
            g=CheckpointGate();g.observe('step1',1,100,101,'pass')
            self.assertFalse(g.observe('step1',2,110,110+delay,verdict))
            self.assertFalse(g.observe('step1',3,125,126,'pass'))

    def test_out_of_order_cannot_advance(self):
        g=CheckpointGate();g.observe('step1',2,110,111,'pass')
        self.assertFalse(g.observe('step1',1,100,112,'pass'))
        self.assertEqual(g.matches,1)
