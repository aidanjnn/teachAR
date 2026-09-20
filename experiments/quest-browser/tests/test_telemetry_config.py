import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from telemetry_config import public_config
import server

DSN = "https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/1"


class TelemetryConfigTests(unittest.TestCase):
    def test_disabled_omits_dsn_and_secrets(self):
        result = public_config(dict(SENTRY_BROWSER_DSN=DSN, SENTRY_AUTH_TOKEN="SECRET"))
        self.assertFalse(result['enabled'])
        self.assertEqual(result['dsn'], '')
        self.assertNotIn('SECRET', json.dumps(result))

    def test_replay_has_separate_explicit_opt_in(self):
        env = dict(SENTRY_ENABLED="true", SENTRY_BROWSER_DSN=DSN,
                   SENTRY_AUTH_TOKEN="SECRET", SENTRY_RELEASE="trail-browser@abc123")
        result = public_config(env)
        self.assertTrue(result['enabled'])
        self.assertFalse(result['replay_enabled'])
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertTrue(public_config(dict(env, SENTRY_REPLAY_ENABLED="true"))['replay_enabled'])

    def test_invalid_or_private_dsn_fails_closed(self):
        for dsn in ['https://key:SECRET@o1.ingest.sentry.io/1', DSN+'?SECRET',
                    DSN+'#SECRET', DSN.replace('https:', 'http:'),
                    DSN.replace('sentry.io', 'sentry.io.attacker.example'), 'SECRET']:
            with self.subTest(dsn=dsn):
                result = public_config(dict(SENTRY_ENABLED='true', SENTRY_BROWSER_DSN=dsn))
                self.assertFalse(result['enabled'])
                self.assertEqual(result['dsn'], '')

    def test_invalid_sample_rates_fail_closed(self):
        for rate in ['NaN', 'inf', '-1', '1.01', 'nonsense']:
            with self.subTest(rate=rate):
                self.assertFalse(public_config(dict(SENTRY_ENABLED='true', SENTRY_BROWSER_DSN=DSN,
                                                   SENTRY_TRACES_SAMPLE_RATE=rate))['enabled'])

    def test_invalid_labels_do_not_leak(self):
        for key in ['SENTRY_RELEASE', 'SENTRY_ENVIRONMENT']:
            result = public_config(dict(SENTRY_ENABLED='true', SENTRY_BROWSER_DSN=DSN,
                                        **{key:'SECRET\n<script>'}))
            self.assertFalse(result['enabled'])
            self.assertNotIn('SECRET', json.dumps(result))


class TelemetryRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def test_config_is_nostore_and_public_only(self):
        with patch.dict('os.environ', dict(SENTRY_ENABLED='true', SENTRY_BROWSER_DSN=DSN,
                                         SENTRY_AUTH_TOKEN='SECRET'), clear=True):
            with urllib.request.urlopen(self.origin+'/api/telemetry/config') as response:
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertNotIn('Access-Control-Allow-Origin', response.headers)
                payload = response.read().decode()
                self.assertNotIn('SECRET', payload)
                self.assertTrue(json.loads(payload)['enabled'])

    def test_cross_origin_configuration_request_rejected(self):
        for headers in [{'Origin':'https://example.com'}, {'Sec-Fetch-Site':'cross-site'},
                        {'Host':'attacker.example'}, {'Origin':'null'}]:
            with self.subTest(headers=headers):
                request = urllib.request.Request(self.origin+'/api/telemetry/config', headers=headers)
                with self.assertRaises(urllib.error.HTTPError) as raised:
                    urllib.request.urlopen(request)
                self.assertEqual(raised.exception.code, 403)


if __name__ == '__main__':
    unittest.main()
