#!/usr/bin/env python3
"""Recover opted-in, hung Compose services; dependency failures never restart."""
import argparse
from dataclasses import dataclass
import datetime
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

ENABLED_LABEL = 'io.guatswr.health-recovery.enabled'
SERVICES = {'backend': 3000, 'web': 3100}


@dataclass(frozen=True)
class Policy:
    failures: int = 3
    sample_seconds: int = 30
    grace_seconds: int = 120
    cooldown_seconds: int = 300
    hourly_limit: int = 3


def eligible(container, project):
    labels = container.get('Config', {}).get('Labels') or {}
    state = container.get('State', {})
    return (labels.get(ENABLED_LABEL) == 'true'
            and labels.get('com.docker.compose.project') == project
            and labels.get('com.docker.compose.service') in SERVICES
            and re.fullmatch(r'[a-f0-9]{64}', container.get('Id', '')) is not None
            and state.get('Status') == 'running' and state.get('Running') is True
            and not state.get('Paused') and not state.get('Restarting')
            and container.get('HostConfig', {}).get('RestartPolicy', {}).get('Name') == 'unless-stopped'
            and not container.get('HostConfig', {}).get('AutoRemove'))


class DockerClient:
    def __init__(self, command=None):
        # Production always uses the local daemon, regardless of shell context.
        self.command = command or ['docker', '--host', 'unix:///var/run/docker.sock']

    def run(self, *arguments, timeout=10):
        return subprocess.run([*self.command, *arguments], check=True, capture_output=True,
                              text=True, timeout=timeout).stdout

    def inspect(self, identity):
        return json.loads(self.run('inspect', identity))[0]

    def containers(self, project):
        ids = self.run('ps', '-aq', '--filter', f'label=com.docker.compose.project={project}',
                       '--filter', f'label={ENABLED_LABEL}=true').split()
        return json.loads(self.run('inspect', *ids)) if ids else []

    def live(self, container, service):
        port = SERVICES[service]
        code = """(async()=>{
          const r=await fetch('http://127.0.0.1:PORT/api/health/live',{signal:AbortSignal.timeout(1500),redirect:'error'});
          if(!r.ok)throw Error();const reader=r.body.getReader();let text='',bytes=0;
          try{for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;if(bytes>4096)throw Error();text+=new TextDecoder().decode(x.value)}}finally{await reader.cancel().catch(()=>{})}
          const x=JSON.parse(text);if(x.status!=='ok'||x.service!=='SERVICE')throw Error()
        })().catch(()=>{process.exitCode=1})""".replace('PORT', str(port)).replace('SERVICE', 'guatswr-' + service)
        try:
            self.run('exec', container['Id'], 'node', '-e', code, timeout=6)
            return True
        except (subprocess.SubprocessError, OSError):
            return False

    def restart(self, identity):
        self.run('restart', '--time', '30', identity, timeout=40)


def validate_state(state, project):
    if state.get('version') != 1 or state.get('project') != project or not isinstance(state.get('services'), dict):
        raise ValueError('invalid watchdog state')
    for service, record in state['services'].items():
        if service not in SERVICES or not isinstance(record, dict):
            raise ValueError('invalid watchdog service state')
        for key in ['last_sample', 'last_restart', 'failures']:
            value = record.get(key, 0)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError('invalid watchdog counter')
        history = record.get('restarts', [])
        if not isinstance(history, list) or len(history) > 16 or any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in history):
            raise ValueError('invalid watchdog restart history')


def save_state(filename, state):
    temp = None
    try:
        with tempfile.NamedTemporaryFile('w', dir=filename.parent, delete=False) as stream:
            temp = Path(stream.name)
            json.dump(state, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o600)
        os.replace(temp, filename)
        if os.name == 'posix':
            directory = os.open(filename.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if temp:
            temp.unlink(missing_ok=True)


def run_once(client, state, project, *, apply=False, now=None, policy=Policy(), save=lambda: None):
    validate_state(state, project)
    now = time.time() if now is None else now
    events = []
    containers = client.containers(project)
    if not containers:
        return [{'service': 'website', 'event': 'no_managed_containers'}]
    counts = {}
    for container in containers:
        name = (container.get('Config', {}).get('Labels') or {}).get('com.docker.compose.service')
        if eligible(container, project):
            counts[name] = counts.get(name, 0) + 1
    for container in containers:
        service = (container.get('Config', {}).get('Labels') or {}).get('com.docker.compose.service')
        if not eligible(container, project):
            events.append({'service': service, 'event': 'ignored'})
            continue
        if counts[service] != 1:
            events.append({'service': service, 'event': 'ambiguous_service'})
            continue
        started = container['State'].get('StartedAt', '')
        started_at = datetime.datetime.fromisoformat(started.replace('Z', '+00:00')).timestamp()
        record = state['services'].setdefault(service, {})
        if record.get('container') != container['Id'] or record.get('started') != started:
            record.update(container=container['Id'], started=started, failures=0, last_sample=0)
        if now < max(record.get('last_sample', 0), record.get('last_restart', 0), started_at):
            events.append({'service': service, 'event': 'clock_skew'})
            continue
        health = container['State'].get('Health', {}).get('Status')
        if health not in ['healthy', 'starting', 'unhealthy']:
            record['failures'] = 0
            events.append({'service': service, 'event': 'probe_not_configured'})
            continue
        if health != 'unhealthy' or now - started_at < policy.grace_seconds:
            record['failures'] = 0
            events.append({'service': service, 'event': 'healthy' if health == 'healthy' else 'grace_period'})
            continue
        if client.live(container, service):
            record['failures'] = 0
            events.append({'service': service, 'event': 'dependency_unavailable'})
            continue
        if now - record.get('last_sample', 0) >= policy.sample_seconds:
            record['failures'] = min(record.get('failures', 0) + 1, policy.failures)
            record['last_sample'] = now
        if record['failures'] < policy.failures:
            events.append({'service': service, 'event': 'liveness_failure', 'failures': record['failures']})
            continue
        history = [value for value in record.get('restarts', []) if now - value < 3600]
        record['restarts'] = history
        if len(history) >= policy.hourly_limit:
            events.append({'service': service, 'event': 'restart_limit'})
            continue
        if now - record.get('last_restart', 0) < policy.cooldown_seconds:
            events.append({'service': service, 'event': 'cooldown'})
            continue
        # Re-check identity, health and liveness after observation; a stopped,
        # replaced or recovered container must never be resurrected.
        current = client.inspect(container['Id'])
        if (not eligible(current, project) or current['Id'] != container['Id']
                or current['State']['StartedAt'] != started
                or current['State'].get('Health', {}).get('Status') != 'unhealthy'
                or client.live(current, service)):
            record['failures'] = 0
            events.append({'service': service, 'event': 'recovered_or_changed'})
            continue
        if not apply:
            events.append({'service': service, 'event': 'would_restart'})
            continue
        record.update(restarts=[*history, now], last_restart=now, failures=0)
        save()  # Reserve the attempt durably BEFORE a restart or daemon failure.
        try:
            client.restart(container['Id'])
            events.append({'service': service, 'event': 'restarted'})
        except (subprocess.SubprocessError, OSError):
            events.append({'service': service, 'event': 'restart_failed'})
    return events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default='guatswr')
    parser.add_argument('--state', type=Path, default=Path('/var/lib/guatswr-health-watchdog/state.json'))
    parser.add_argument('--apply', action='store_true', help='enable bounded recovery; otherwise observe only')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', args.project) or not args.state.is_absolute() or args.state.is_symlink():
        parser.error('explicit Compose project and private absolute state path required')
    args.state.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    import fcntl
    with args.state.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.state.exists() and (not args.state.is_file() or args.state.stat().st_size > 65536):
            raise ValueError('invalid watchdog state file')
        state = json.loads(args.state.read_text()) if args.state.exists() else {'version': 1, 'project': args.project, 'services': {}}

        def save():
            save_state(args.state, state)

        events = run_once(DockerClient(), state, args.project, apply=args.apply, save=save)
        save()
        for event in events:
            print(json.dumps(event), flush=True)
        return 0 if all(event['event'] in ['healthy', 'grace_period', 'ignored', 'restarted', 'recovered_or_changed'] for event in events) else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({'event': 'watchdog_failed', 'kind': type(error).__name__}), flush=True)
        raise SystemExit(1)
