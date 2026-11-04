"""Opt-in isolated Docker Desktop drill; no production project/ports/volumes."""
import argparse
import json
import subprocess
import time
import uuid

from health_watchdog import DockerClient, ENABLED_LABEL, Policy, run_once

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--image', required=True, help='an already available image containing node and sh')
parser.add_argument('--context', default='desktop-linux')
args = parser.parse_args()
endpoint = subprocess.check_output(['docker', 'context', 'inspect', args.context, '--format', '{{.Endpoints.docker.Host}}'], text=True).strip()
if not (endpoint.startswith('npipe:////./pipe/') or endpoint == 'unix:///var/run/docker.sock'):
    raise SystemExit('Only a verified local Docker daemon is permitted')
client = DockerClient(['docker', '--context', args.context])
project = 'guatswr-health-test-' + uuid.uuid4().hex[:10]
identity = None
code = """let mode='ok';process.on('SIGTERM',()=>process.exit(0));require('http').createServer((req,res)=>{
 if(req.url.startsWith('/test/')){mode=req.url.slice(6);res.end('ok');if(mode==='hang')setTimeout(()=>{while(true){}},30);return}
 if(mode==='hang')return;
 res.setHeader('content-type','application/json');
 if(req.url.endsWith('/live'))return res.end(JSON.stringify({status:'ok',service:'guatswr-web'}));
 res.statusCode=mode==='dependency'?503:200;res.end(JSON.stringify({status:mode==='dependency'?'not_ready':'ready'}))
}).listen(3100,'127.0.0.1')"""
probe = "node -e \"fetch('http://127.0.0.1:3100/api/health/ready',{signal:AbortSignal.timeout(500)}).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})\""


def wait_health(expected):
    for _ in range(40):
        if client.inspect(identity)['State'].get('Health', {}).get('Status') == expected:
            return
        time.sleep(.5)
    raise AssertionError('synthetic container health timeout')


def mode(value):
    client.run('exec', identity, 'node', '-e', f"fetch('http://127.0.0.1:3100/test/{value}').then(r=>r.text())")


try:
    identity = client.run('run', '-d', '--name', project, '--network', 'none', '--restart', 'unless-stopped',
                          '--cpus', '0.5', '--memory', '256m', '--pids-limit', '128',
                          '--label', f'com.docker.compose.project={project}', '--label', 'com.docker.compose.service=web',
                          '--label', f'{ENABLED_LABEL}=true', '--health-cmd', probe, '--health-interval', '1s',
                          '--health-timeout', '2s', '--health-retries', '1', '--health-start-period', '0s',
                          '--entrypoint', 'node', args.image, '-e', code, timeout=30).strip()
    wait_health('healthy')
    started = client.inspect(identity)['State']['StartedAt']
    data = {'version': 1, 'project': project, 'services': {}}
    policy = Policy(sample_seconds=0, grace_seconds=0)
    mode('dependency')
    wait_health('unhealthy')
    for _ in range(3):
        assert run_once(client, data, project, apply=True, policy=policy)[0]['event'] == 'dependency_unavailable'
    assert client.inspect(identity)['State']['StartedAt'] == started
    mode('ok')
    wait_health('healthy')
    mode('hang')
    wait_health('unhealthy')
    for _ in range(3):
        events = run_once(client, data, project, apply=True, policy=policy)
    assert events[0]['event'] == 'restarted', events
    wait_health('healthy')
    assert client.inspect(identity)['State']['StartedAt'] != started
    client.run('stop', '--time', '1', identity)
    assert run_once(client, data, project, apply=True, policy=policy)[0]['event'] == 'ignored'
    assert client.inspect(identity)['State']['Running'] is False
    print(json.dumps({'passed': True, 'dependency_failure_did_not_restart': True, 'hung_process_recovered': True, 'manual_stop_preserved': True}))
finally:
    if identity:
        own = client.inspect(identity)
        assert own['Config']['Labels']['com.docker.compose.project'] == project
        client.run('rm', '-f', identity)
