#!/usr/bin/env python3
"""Unit tests for OPS-03 Business Probes, Backup Freshness, and Watchdog Monitor."""
import datetime as dt
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

from ops_monitor import (
    atomic_write_json,
    collect,
    evaluate_backup_freshness,
    evaluate_probe,
    run_cycle,
)


class MockHTTPResponse:
    def __init__(self, body: bytes, status: int = 200, headers: dict = None):
        self._body = body
        self.status = status
        self.headers = headers or {}

    def read(self, n=-1):
        if n < 0:
            return self._body
        return self._body[:n]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class ProbeEvaluationTests(unittest.TestCase):
    def test_homepage_positive_content_assertion(self):
        # 1. 200 OK with content matches -> passes
        def mock_success(req, timeout=5):
            return MockHTTPResponse(b'<html><head><title>GUAT SWR</title></head><body>Welcome</body></html>')

        probe = {'name': 'homepage', 'url': 'https://example.com/', 'contains': 'GUAT SWR'}
        evaluate_probe(probe, opener=mock_success)

        # 2. 200 OK but content missing -> raises ValueError (arbitrary 200 prohibited)
        def mock_missing_content(req, timeout=5):
            return MockHTTPResponse(b'<html><head><title>Generic Default Nginx Page</title></head></html>')

        with self.assertRaises(ValueError) as ctx:
            evaluate_probe(probe, opener=mock_missing_content)
        self.assertIn("Required content snippet 'GUAT SWR' not found", str(ctx.exception))

    def test_readiness_service_and_status(self):
        # 1. Valid JSON with correct service and status=ok -> passes
        def mock_ready(req, timeout=5):
            return MockHTTPResponse(b'{"service":"guatswr-web","status":"ok","timestamp":12345}')

        probe = {'name': 'readiness', 'url': 'https://example.com/ready', 'service': 'guatswr-web'}
        evaluate_probe(probe, opener=mock_ready)

        # 2. Valid JSON but status is degraded -> raises ValueError
        def mock_degraded(req, timeout=5):
            return MockHTTPResponse(b'{"service":"guatswr-web","status":"degraded"}')

        with self.assertRaises(ValueError) as ctx:
            evaluate_probe(probe, opener=mock_degraded)
        self.assertIn("status 'degraded' != 'ok'", str(ctx.exception))

        # 3. HTML error page with 200 status -> raises ValueError
        def mock_html_error(req, timeout=5):
            return MockHTTPResponse(b'<html>Error 500</html>')

        with self.assertRaises(ValueError) as ctx:
            evaluate_probe(probe, opener=mock_html_error)
        self.assertIn("Invalid JSON", str(ctx.exception))

    def test_static_asset_probe(self):
        # 1. Image with matching content-type and size -> passes
        fake_png = b'\x89PNG\r\n\x1a\n' + b'A' * 200
        def mock_img_success(req, timeout=5):
            return MockHTTPResponse(fake_png, headers={'Content-Type': 'image/png'})

        probe = {
            'name': 'static-icon',
            'url': 'https://example.com/favicon.ico',
            'content_type': 'image/',
            'min_bytes': 100
        }
        evaluate_probe(probe, opener=mock_img_success)

        # 2. Too small body -> raises ValueError
        def mock_tiny_body(req, timeout=5):
            return MockHTTPResponse(b'tiny', headers={'Content-Type': 'image/png'})

        with self.assertRaises(ValueError) as ctx:
            evaluate_probe(probe, opener=mock_tiny_body)
        self.assertIn('Body length 4 < min_bytes 100', str(ctx.exception))

        # 3. Wrong content-type (e.g. text/html 404 page masquerading as 200)
        def mock_html_instead(req, timeout=5):
            return MockHTTPResponse(b'A' * 200, headers={'Content-Type': 'text/html'})

        with self.assertRaises(ValueError) as ctx:
            evaluate_probe(probe, opener=mock_html_instead)
        self.assertIn("Content-Type 'text/html' does not match 'image/'", str(ctx.exception))


class BackupFreshnessTests(unittest.TestCase):
    def test_backup_freshness_requires_valid_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            now = 1000000.0
            backup_cfg = {'name': 'offsite', 'root': str(root), 'pattern': 'guatswr-*.tar.gpg', 'max_age_hours': 30}

            # Case 1: No archive -> False
            self.assertFalse(evaluate_backup_freshness(backup_cfg, now=now))

            # Case 2: Archive exists but NO receipt -> False (mtime alone is not trusted)
            archive = root / 'guatswr-20261106T000000Z.tar.gpg'
            archive.write_bytes(b'cipher')
            os.utime(archive, (now, now))
            self.assertFalse(evaluate_backup_freshness(backup_cfg, now=now))

            # Case 3: Fresh receipt exists (1 hour old) -> True
            receipt = root / 'guatswr-20261106T000000Z.receipt.json'
            fresh_time = dt.datetime.fromtimestamp(now - 3600, dt.timezone.utc).isoformat()
            data = {'format': 'guatswr-receiver-receipt-v1', 'status': 'transferred',
                    'tag': '20261106T000000Z', 'package_name': archive.name,
                    'encrypted_sha256': hashlib.sha256(b'cipher').hexdigest(), 'received_at': fresh_time}
            receipt.write_text(json.dumps(data))
            self.assertTrue(evaluate_backup_freshness(backup_cfg, now=now))

            # Case 4: Stale receipt (35 hours old > 30 hours threshold) -> False
            stale_time = dt.datetime.fromtimestamp(now - (35 * 3600), dt.timezone.utc).isoformat()
            receipt.write_text(json.dumps({**data, 'received_at': stale_time}))
            self.assertFalse(evaluate_backup_freshness(backup_cfg, now=now))

    def test_receipts_must_bind_an_existing_unchanged_package_and_nonfuture_time(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / 'guatswr-current.tar.gpg'
            archive.write_bytes(b'cipher')
            receipt = root / 'guatswr-current.receipt.json'
            cfg = {'root': str(root)}
            data = {'format': 'guatswr-receiver-receipt-v1', 'status': 'transferred',
                    'tag': 'current', 'package_name': archive.name,
                    'encrypted_sha256': hashlib.sha256(b'cipher').hexdigest(), 'received_at': 1000}
            for invalid in [
                {'received_at': 1000},
                {**data, 'package_name': 'guatswr-missing.tar.gpg', 'tag': 'missing'},
                {**data, 'encrypted_sha256': '0' * 64},
                {**data, 'received_at': 2000},
                {**data, 'received_at': float('inf')},
                {**data, 'format': 'unknown'},
            ]:
                receipt.write_text(json.dumps(invalid))
                self.assertFalse(evaluate_backup_freshness(cfg, now=1000), invalid)
            receipt.write_text(json.dumps(data))
            self.assertTrue(evaluate_backup_freshness(cfg, now=1000))
            archive.write_bytes(b'corrupted')
            self.assertFalse(evaluate_backup_freshness(cfg, now=1000))


class MonitoringLifecycleTests(unittest.TestCase):
    def test_alert_threshold_reminder_and_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state_file = root / 'state.json'

            sent_messages = []
            def mock_poster(req, timeout=10):
                body = json.loads(req.data.decode('utf-8'))
                sent_messages.append(body['text'])
                return MockHTTPResponse(b'{"ok":true}', status=200)

            config = {
                'probes': [{'name': 'homepage', 'url': 'https://example.com/', 'contains': 'PASS'}],
                'disks': [],
                'backups': [],
                'webhook': 'https://hooks.example.com/alerts'
            }

            def failing_opener(req, timeout=5):
                return MockHTTPResponse(b'FAIL', status=200)

            def passing_opener(req, timeout=5):
                return MockHTTPResponse(b'PASS', status=200)

            # Cycle 1: 1st failure -> no active alert, no notify
            t0 = 10000.0
            r1 = run_cycle(config, state_file, opener=failing_opener, poster=mock_poster, now=t0)
            self.assertEqual(r1['issues'], ['probe:homepage'])
            self.assertEqual(r1['active'], [])
            self.assertFalse(r1['notified'])
            self.assertEqual(len(sent_messages), 0)

            # Cycle 2: 2nd failure -> still no active alert
            r2 = run_cycle(config, state_file, opener=failing_opener, poster=mock_poster, now=t0 + 60)
            self.assertEqual(r2['active'], [])
            self.assertFalse(r2['notified'])
            self.assertEqual(len(sent_messages), 0)

            # Cycle 3: 3rd failure -> ACTIVE ALERT triggered! Notification sent!
            r3 = run_cycle(config, state_file, opener=failing_opener, poster=mock_poster, now=t0 + 120)
            self.assertEqual(r3['active'], ['probe:homepage'])
            self.assertTrue(r3['notified'])
            self.assertEqual(len(sent_messages), 1)
            self.assertIn('ALERT: probe:homepage', sent_messages[-1])

            # Cycle 4: Still failing 10 mins later (t0 + 720) -> no spam (< 3600s)
            r4 = run_cycle(config, state_file, opener=failing_opener, poster=mock_poster, now=t0 + 720)
            self.assertTrue('probe:homepage' in r4['active'])
            self.assertFalse(r4['notified'])
            self.assertEqual(len(sent_messages), 1)

            # Cycle 5: Still failing after 1 hour (t0 + 3800s) -> hourly reminder sent!
            r5 = run_cycle(config, state_file, opener=failing_opener, poster=mock_poster, now=t0 + 3800)
            self.assertTrue(r5['notified'])
            self.assertEqual(len(sent_messages), 2)
            self.assertIn('ALERT: probe:homepage', sent_messages[-1])

            # Cycle 6: Recovers! -> sends recovery notification ONCE!
            r6 = run_cycle(config, state_file, opener=passing_opener, poster=mock_poster, now=t0 + 3900)
            self.assertEqual(r6['issues'], [])
            self.assertEqual(r6['active'], [])
            self.assertTrue(r6['notified'])
            self.assertEqual(len(sent_messages), 3)
            self.assertEqual('GuatSWR: recovered', sent_messages[-1])

            # Cycle 7: Next cycle remains clean -> no further notifications
            r7 = run_cycle(config, state_file, opener=passing_opener, poster=mock_poster, now=t0 + 4000)
            self.assertFalse(r7['notified'])
            self.assertEqual(len(sent_messages), 3)

    def test_failed_notification_is_retried_next_cycle(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state_file = root / 'state.json'

            attempts = []
            def failing_poster(req, timeout=10):
                attempts.append('fail')
                raise RuntimeError("500 Server Error from Webhook")

            def success_poster(req, timeout=10):
                attempts.append('success')
                return MockHTTPResponse(b'{"ok":true}', status=200)

            config = {
                'probes': [{'name': 'homepage', 'url': 'https://example.com/', 'contains': 'PASS'}],
                'disks': [],
                'backups': [],
                'webhook': 'https://hooks.example.com/alerts'
            }
            failing_opener = lambda req, timeout=5: MockHTTPResponse(b'FAIL', status=200)

            # Prime with 2 failures
            run_cycle(config, state_file, opener=failing_opener, now=1000)
            run_cycle(config, state_file, opener=failing_opener, now=1060)

            # 3rd failure: notification attempt fails!
            r3 = run_cycle(config, state_file, opener=failing_opener, poster=failing_poster, now=1120)
            self.assertFalse(r3['notified'])
            self.assertEqual(attempts, ['fail'])

            # State sent timestamp MUST NOT be updated to 1120
            saved = json.loads(state_file.read_text(encoding='utf-8'))
            self.assertEqual(saved['sent'], 0)

            # Next cycle 60 seconds later: should promptly retry and succeed!
            r4 = run_cycle(config, state_file, opener=failing_opener, poster=success_poster, now=1180)
            self.assertTrue(r4['notified'])
            self.assertEqual(attempts, ['fail', 'success'])

    def test_unconfigured_webhook_reports_blocked_external(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state_file = root / 'state.json'
            config = {
                'probes': [],
                'disks': [],
                'backups': [],
                'webhook': ''  # Unconfigured
            }
            r = run_cycle(config, state_file)
            self.assertEqual(r['notification_status'], 'BLOCKED_EXTERNAL')
            self.assertFalse(r['notified'])


if __name__ == '__main__':
    unittest.main()
