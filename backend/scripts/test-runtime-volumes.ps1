param([Parameter(Mandatory=$true)][string]$Image)
$ErrorActionPreference = 'Stop'
$testPrefix = 'guatswr-bm33-' + [Guid]::NewGuid().ToString('N')
$dataVolume = $testPrefix + '-data'
$backupVolume = $testPrefix + '-backups'
$blockedVolume = $testPrefix + '-blocked'
$containerName = $testPrefix + '-app'
$stateMounts = @('--mount', "type=volume,source=$dataVolume,target=/app/data", '--mount', "type=volume,source=$backupVolume,target=/app/backups")
$testEnvironment = @('-e', 'JWT_SECRET=synthetic-volume-runtime-secret', '-e', 'BFF_BRIDGE_SECRET=synthetic-volume-runtime-bridge-key-32-chars')
try {
  foreach ($volumeName in @($dataVolume, $backupVolume, $blockedVolume)) {
    docker volume create $volumeName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable volume creation failed' }
  }
  docker run --rm --network none @stateMounts $Image node scripts/test-volume-fixture.cjs provision
  if ($LASTEXITCODE -ne 0) { throw 'Non-root volume provisioning failed' }
  foreach ($iteration in 1..2) {
    docker run -d --network none --name $containerName @stateMounts @testEnvironment $Image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Non-root container start failed' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      docker exec $containerName node scripts/healthcheck.cjs 2>$null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
      Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Disposable container did not become ready' }
    docker exec $containerName node scripts/test-volume-fixture.cjs check
    if ($LASTEXITCODE -ne 0) { throw 'Persistent state check failed' }
    docker stop --time 20 $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Graceful container stop failed' }
    $exitCode = docker inspect --format '{{.State.ExitCode}}' $containerName
    if ($exitCode -ne '0') { throw 'Container did not exit cleanly' }
    docker rm $containerName | Out-Null
  }
  docker run --rm --network none --mount "type=volume,source=$blockedVolume,target=/app/data" --mount "type=volume,source=$backupVolume,target=/app/backups" $Image node scripts/test-volume-fixture.cjs provision
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic permissions database provisioning failed' }
  docker run --rm --network none --user 0 --mount "type=volume,source=$blockedVolume,target=/app/data" $Image chmod 000 /app/data
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic permissions fixture failed' }
  docker run --rm --network none --mount "type=volume,source=$blockedVolume,target=/app/data" @testEnvironment $Image
  if ($LASTEXITCODE -eq 0) { throw 'Unreadable data volume unexpectedly started' }
  Write-Output '{"persistentRecreation":true,"nonRoot":true,"permissionFailure":true,"gracefulStop":true}'
} finally {
  # Only names generated for this invocation may be removed. No host paths.
  foreach ($name in @($containerName, $dataVolume, $backupVolume, $blockedVolume)) {
    if (!$name.StartsWith($testPrefix + '-')) { throw 'Unsafe disposable resource cleanup' }
  }
  docker rm -f $containerName 2>$null | Out-Null
  docker volume rm $dataVolume $backupVolume $blockedVolume 2>$null | Out-Null
}
