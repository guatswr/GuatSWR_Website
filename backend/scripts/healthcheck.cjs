// Docker reports business readiness, not just a constant version response.
fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health/ready`, { signal: AbortSignal.timeout(2000), redirect: 'error' })
  .then(async response => { const body = await response.json(); if (!response.ok || body.status !== 'ready' || body.service !== 'guatswr-backend') process.exitCode = 1; })
  .catch(() => { process.exitCode = 1; });
