fetch(`http://127.0.0.1:${process.env.PORT || 3100}/api/health/ready`, { signal: AbortSignal.timeout(2000), redirect: 'error' })
  .then(async response => {
    const result = await response.json()
    if (!response.ok || result.status !== 'ready' || result.service !== 'guatswr-web') process.exitCode = 1
  }).catch(() => { process.exitCode = 1 })
