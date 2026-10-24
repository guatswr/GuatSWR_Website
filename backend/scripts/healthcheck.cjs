// Read-only liveness; never provisions a database or runs maintenance.
fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/version`, { signal: AbortSignal.timeout(1500) })
  .then(async response => { if (!response.ok || (await response.json()).status !== 'online') process.exitCode = 1; })
  .catch(() => { process.exitCode = 1; });
