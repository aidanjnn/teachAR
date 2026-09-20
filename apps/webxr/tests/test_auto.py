import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from auto_checks import AutoChecks


class AutoTests(unittest.TestCase):
    def setUp(self):
        self.now=100.
        self.auto=AutoChecks(lambda:self.now)
        self.budget={'enabled':True,'busy':False,'cooldown_seconds':0}
        self.calls=[]

    def tick(self,ready=True,run=None):
        self.auto.tick(ready,self.budget,run or (lambda:self.calls.append(self.now)))

    def test_default_off_and_first_check_after_ten_seconds(self):
        self.tick();self.assertEqual(self.calls,[])
        self.auto.set_enabled(True);self.now=109;self.tick();self.assertEqual(self.calls,[])
        self.now=110;self.tick();self.assertEqual(self.calls,[110])
        self.assertEqual(self.auto.status()['countdown_seconds'],10)

    def test_multiple_tabs_and_repeated_ticks_cannot_multiply_calls(self):
        self.auto.set_enabled(True);self.now=110
        self.tick();self.tick();self.auto.set_enabled(True);self.tick()
        self.assertEqual(self.calls,[110])
        self.now=120;self.tick();self.assertEqual(self.calls,[110,120])

    def test_cooldown_after_manual_check_is_respected(self):
        self.auto.set_enabled(True);self.now=110;self.budget['cooldown_seconds']=6
        self.tick();self.assertEqual(self.calls,[])
        self.assertGreaterEqual(self.auto.status()['countdown_seconds'],6)
        self.budget['cooldown_seconds']=0;self.now=117;self.tick();self.assertEqual(self.calls,[117])

    def test_stale_camera_never_calls_and_stops_after_thirty_seconds(self):
        self.auto.set_enabled(True);self.now=110;self.tick(False)
        self.now=140;self.tick(False)
        self.assertEqual(self.calls,[]);self.assertFalse(self.auto.status()['enabled'])
        self.now=141;self.tick(True);self.assertEqual(self.calls,[])

    def test_short_camera_pause_resumes_without_catchup_burst(self):
        self.auto.set_enabled(True);self.now=110;self.tick(False)
        self.now=125;self.tick();self.tick()
        self.assertEqual(self.calls,[125])

    def test_disabling_prevents_future_calls(self):
        self.auto.set_enabled(True);self.auto.set_enabled(False);self.now=200;self.tick()
        self.assertEqual(self.calls,[])

    def test_inflight_no_overlap_and_off_during_request_stays_off(self):
        self.auto.set_enabled(True);self.now=110
        def run():
            self.calls.append(self.now)
            self.tick()
            self.auto.set_enabled(False)
        self.tick(run=run)
        self.now=130;self.tick()
        self.assertEqual(self.calls,[110]);self.assertFalse(self.auto.status()['enabled'])

    def test_exhausted_budget_or_error_stops_auto(self):
        self.auto.set_enabled(True);self.budget['enabled']=False;self.now=110;self.tick()
        self.assertFalse(self.auto.status()['enabled']);self.assertEqual(self.calls,[])
        self.budget['enabled']=True;self.auto.set_enabled(True);self.now=120
        def fail():raise ValueError('test')
        self.tick(run=fail);self.assertFalse(self.auto.status()['enabled'])
        self.now=140;self.tick();self.assertEqual(self.calls,[])

    def test_slow_request_does_not_enqueue_catchup(self):
        self.auto.set_enabled(True);self.now=110
        def slow():self.calls.append(self.now);self.now=128
        self.tick(run=slow);self.tick()
        self.assertEqual(self.calls,[110])

    def test_non_boolean_enable_rejected(self):
        with self.assertRaises(ValueError):self.auto.set_enabled('false')
