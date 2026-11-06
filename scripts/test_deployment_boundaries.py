#!/usr/bin/env python3
"""Unit tests for OPS-04 Deployment Boundaries and Healthcheck Contracts."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import unittest


ROOT = Path(__file__).resolve().parent.parent


class HealthMockHandler(http.server.BaseHTTPRequestHandler):
    mode = 'ok'
    service_name = 'guatswr-web'

    def do_GET(self):
        if self.path == '/api/health/ready':
            if self.mode == 'ok':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ready', 'service': self.service_name}).encode('utf-8'))
            elif self.mode == 'not_ready':
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'not_ready', 'service': self.service_name}).encode('utf-8'))
            elif self.mode == 'wrong_service':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ready', 'service': 'rogue-service'}).encode('utf-8'))
            elif self.mode == 'error_500':
                self.send_response(500)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(b'<html>Internal Server Error</html>')
            else:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence HTTP server logs during tests
        pass


class DeploymentBoundariesTopologyTests(unittest.TestCase):
    def test_docker_compose_bind_mounts_prevent_host_path_auto_creation(self):
        compose_text = (ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
        
        # Check services that mount host directories: backend, umami, umami-db, komari
        # They must all explicitly specify create_host_path: false
        self.assertIn('create_host_path: false', compose_text)
        
        # Verify create_host_path: false appears for all 5 bind volumes:
        # 1. backend data
        # 2. backend backups
        # 3. umami geo
        # 4. umami-db data
        # 5. komari data
        occurrences = compose_text.count('create_host_path: false')
        self.assertGreaterEqual(occurrences, 5, f"Expected at least 5 'create_host_path: false' entries, found {occurrences}")

    def test_docker_compose_resource_budgets_specified_per_service(self):
        compose_text = (ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
        
        # Verify each tier has independent, tailored resource limits
        self.assertIn('BACKEND_MEMORY_LIMIT', compose_text)
        self.assertIn('WEB_MEMORY_LIMIT', compose_text)
        self.assertIn('UMAMI_MEMORY_LIMIT', compose_text)
        self.assertIn('UMAMI_DB_MEMORY_LIMIT', compose_text)
        self.assertIn('KOMARI_MEMORY_LIMIT', compose_text)
        
        # Verify CPU limits
        self.assertIn('BACKEND_CPU_LIMIT', compose_text)
        self.assertIn('WEB_CPU_LIMIT', compose_text)
        self.assertIn('UMAMI_CPU_LIMIT', compose_text)
        self.assertIn('UMAMI_DB_CPU_LIMIT', compose_text)
        self.assertIn('KOMARI_CPU_LIMIT', compose_text)

    def test_dockerignore_excludes_data_and_geo_archives(self):
        ignore_text = (ROOT / '.dockerignore').read_text(encoding='utf-8')
        
        # Verifies persistent data and geolite databases are excluded from images
        self.assertIn('deploy/**/data', ignore_text)
        self.assertIn('deploy/umami/geo/*.mmdb', ignore_text)
        self.assertIn('deploy/umami/geo/*.tar.gz', ignore_text)


class HealthcheckProbeScriptContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(('127.0.0.1', 0), HealthMockHandler)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def run_healthcheck(self, script_path: Path, port: int) -> int:
        node_bin = os.environ.get('BACKUP_NODE_BIN', 'node')
        env = dict(os.environ)
        env['PORT'] = str(port)
        result = subprocess.run([node_bin, str(script_path)], env=env, capture_output=True)
        return result.returncode

    def test_web_healthcheck_success(self):
        HealthMockHandler.mode = 'ok'
        HealthMockHandler.service_name = 'guatswr-web'
        code = self.run_healthcheck(ROOT / 'web/scripts/healthcheck.mjs', self.port)
        self.assertEqual(code, 0)

    def test_web_healthcheck_fails_on_degraded_503(self):
        HealthMockHandler.mode = 'not_ready'
        HealthMockHandler.service_name = 'guatswr-web'
        code = self.run_healthcheck(ROOT / 'web/scripts/healthcheck.mjs', self.port)
        self.assertEqual(code, 1)

    def test_web_healthcheck_fails_on_wrong_service(self):
        HealthMockHandler.mode = 'wrong_service'
        code = self.run_healthcheck(ROOT / 'web/scripts/healthcheck.mjs', self.port)
        self.assertEqual(code, 1)

    def test_web_healthcheck_fails_on_500_html(self):
        HealthMockHandler.mode = 'error_500'
        code = self.run_healthcheck(ROOT / 'web/scripts/healthcheck.mjs', self.port)
        self.assertEqual(code, 1)

    def test_web_healthcheck_fails_on_connection_refused(self):
        # Choose an unused port
        dead_port = self.port + 999
        code = self.run_healthcheck(ROOT / 'web/scripts/healthcheck.mjs', dead_port)
        self.assertEqual(code, 1)

    def test_backend_healthcheck_success(self):
        HealthMockHandler.mode = 'ok'
        HealthMockHandler.service_name = 'guatswr-backend'
        code = self.run_healthcheck(ROOT / 'backend/scripts/healthcheck.cjs', self.port)
        self.assertEqual(code, 0)

    def test_backend_healthcheck_fails_on_degraded_503(self):
        HealthMockHandler.mode = 'not_ready'
        HealthMockHandler.service_name = 'guatswr-backend'
        code = self.run_healthcheck(ROOT / 'backend/scripts/healthcheck.cjs', self.port)
        self.assertEqual(code, 1)


if __name__ == '__main__':
    unittest.main()
