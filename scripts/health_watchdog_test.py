import copy
import datetime
import json
from pathlib import Path
import tempfile
import unittest

from health_watchdog import ENABLED_LABEL, Policy, eligible, run_once, save_state, validate_state

PROJECT = 'health-fixture'


def container(service='web', **state):
    return {'Id': ('a' if service == 'web' else 'b') * 64,
            'Config': {'Labels': {ENABLED_LABEL: 'true', 'com.docker.compose.project': PROJECT, 'com.docker.compose.service': service}},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}, 'AutoRemove': False},
            'State': {'Status': 'running', 'Running': True, 'Paused': False, 'Restarting': False,
                      'StartedAt': datetime.datetime.fromtimestamp(1000, datetime.timezone.utc).isoformat(),
                      'Health': {'Status': 'unhealthy'}, **state}}


class Client:
    def __init__(self, values=None, live=False):
        self.values = values or [container()]
        self.is_live = live
        self.restarted = []
        self.changed = None
        self.restart_error = False

    def containers(self, _project):
        return copy.deepcopy(self.values)

    def live(self, _container, _service):
        return self.is_live

    def inspect(self, identity):
        return copy.deepcopy(self.changed or next(value for value in self.values if value['Id'] == identity))

    def restart(self, identity):
        if self.restart_error:
            raise OSError('synthetic daemon failure')
        self.restarted.append(identity)


def state():
    return {'version': 1, 'project': PROJECT, 'services': {}}


class RecoveryTests(unittest.TestCase):
    def test_unready_but_live_service_never_restarts(self):
        client, data = Client(live=True), state()
        for tick in range(20):
            events = run_once(client, data, PROJECT, apply=True, now=10000 + tick * 60)
            self.assertEqual(events[0]['event'], 'dependency_unavailable')
        self.assertEqual(client.restarted, [])

    def test_requires_spaced_consecutive_failures_and_preserves_default_dry_run(self):
        client, data = Client(), state()
        for now in [10000, 10001, 10002]:
            run_once(client, data, PROJECT, apply=True, now=now)
        self.assertEqual(data['services']['web']['failures'], 1)
        run_once(client, data, PROJECT, apply=True, now=10060)
        self.assertEqual(run_once(client, data, PROJECT, now=10120)[0]['event'], 'would_restart')
        self.assertEqual(client.restarted, [])
        run_once(client, data, PROJECT, apply=True, now=10180)
        self.assertEqual(len(client.restarted), 1)

    def test_cooldown_and_hourly_budget_survive_container_recreation(self):
        client, data = Client(), state()
        data['services']['web'] = {'last_restart': 9950, 'restarts': [9700, 9800, 9950]}
        for now in [10000, 10060, 10120]:
            events = run_once(client, data, PROJECT, apply=True, now=now)
        self.assertEqual(events[0]['event'], 'restart_limit')
        self.assertEqual(len(client.restarted), 0)
        data['services']['web']['restarts'] = [9950]
        events = run_once(client, data, PROJECT, apply=True, now=10180)
        self.assertEqual(events[0]['event'], 'cooldown')

    def test_reserves_restart_attempt_before_daemon_failure(self):
        client, data = Client(), state()
        client.restart_error = True
        saved = []
        for now in [10000, 10060, 10120]:
            events = run_once(client, data, PROJECT, apply=True, now=now, save=lambda: saved.append(copy.deepcopy(data)))
        self.assertEqual(events[0]['event'], 'restart_failed')
        self.assertEqual(saved[-1]['services']['web']['restarts'], [10120])

    def test_stopped_paused_foreign_or_not_opted_in_containers_are_ignored(self):
        for key, value in [('Status', 'exited'), ('Running', False), ('Paused', True), ('Restarting', True)]:
            candidate = container(**{key: value})
            self.assertFalse(eligible(candidate, PROJECT))
            client = Client([candidate])
            run_once(client, state(), PROJECT, apply=True, now=10000)
            self.assertEqual(client.restarted, [])
        candidate = container()
        self.assertFalse(eligible(candidate, 'other-project'))
        candidate['Config']['Labels'][ENABLED_LABEL] = 'false'
        self.assertFalse(eligible(candidate, PROJECT))

    def test_startup_grace_missing_probe_and_manual_stop_during_preflight(self):
        candidate = container(StartedAt=datetime.datetime.fromtimestamp(9990, datetime.timezone.utc).isoformat())
        client = Client([candidate])
        self.assertEqual(run_once(client, state(), PROJECT, apply=True, now=10000)[0]['event'], 'grace_period')
        client = Client([container(Health={})])
        self.assertEqual(run_once(client, state(), PROJECT, apply=True, now=10000)[0]['event'], 'probe_not_configured')
        client, data = Client(), state()
        client.changed = container(Status='exited', Running=False)
        for now in [10000, 10060, 10120]:
            events = run_once(client, data, PROJECT, apply=True, now=now)
        self.assertEqual(events[0]['event'], 'recovered_or_changed')
        self.assertEqual(client.restarted, [])

    def test_clock_rollback_and_corrupt_state_cannot_reset_safety_limits(self):
        client, data = Client(), state()
        data['services']['web'] = {'last_restart': 11000}
        self.assertEqual(run_once(client, data, PROJECT, apply=True, now=10000)[0]['event'], 'clock_skew')
        for value in [float('nan'), -1, '1']:
            with self.assertRaises(ValueError):
                validate_state({'version': 1, 'project': PROJECT, 'services': {'web': {'last_restart': value}}}, PROJECT)

    def test_persists_attempts_atomically_and_rejects_invalid_json_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory) / 'state.json'
            valid = state()
            save_state(filename, valid)
            invalid = state()
            invalid['services']['web'] = {'last_restart': float('nan')}
            with self.assertRaises(ValueError):
                save_state(filename, invalid)
            self.assertEqual(json.loads(filename.read_text()), valid)
            self.assertEqual([file.name for file in filename.parent.iterdir()], ['state.json'])

    def test_restarts_only_the_hung_service_and_ignores_retired_containers(self):
        retired = container(Status='exited', Running=False)
        retired['Id'] = 'c' * 64
        client = Client([container('backend'), container(), retired])
        client.live = lambda _container, service: service == 'web'
        data = state()
        for now in [10000, 10060, 10120]:
            run_once(client, data, PROJECT, apply=True, now=now)
        self.assertEqual(client.restarted, ['b' * 64])


if __name__ == '__main__':
    unittest.main()
