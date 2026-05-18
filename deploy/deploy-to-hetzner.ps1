# Deploy Tokenometer to the Hetzner server without touching ai-radar.
#
# Usage examples:
#   .\deploy\deploy-to-hetzner.ps1
#   .\deploy\deploy-to-hetzner.ps1 -CommitAndPush -CommitMessage "Deploy Tokenometer"
#
# This script intentionally deploys to /opt/tokenometer and aborts if a path
# points at ai-radar.

[CmdletBinding()]
param(
    [string]$CommitMessage = "Update Tokenometer deployment",
    [switch]$CommitAndPush,
    [string]$ServerIp = "46.224.91.14",
    [string]$ServerUser = "root",
    [string]$ProjectPath = "/opt/tokenometer",
    [string]$Branch = "main",
    [string]$Remote = "origin",
    [string]$TokenometerPort = "3100",
    [string]$PublicUrl = "",
    [string]$IdentityFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Host "ABORT: $Message" -ForegroundColor Red
    exit 1
}

function Invoke-Checked($Command, $Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

if ($ProjectPath -match "ai-radar" -or $ProjectPath -eq "/opt/ai-radar") {
    Fail "ProjectPath points at ai-radar. Tokenometer must use /opt/tokenometer or another isolated path."
}

if ((Split-Path -Leaf (Get-Location).Path) -ne "Tokenometer") {
    Write-Host "Warning: current folder is not named Tokenometer." -ForegroundColor Yellow
}

if (!(Test-Path "package.json")) {
    Fail "package.json not found. Run this from the Tokenometer repo root."
}

$package = Get-Content "package.json" -Raw
if ($package -notmatch '"name"\s*:\s*"tokenradar"') {
    Fail "package.json does not look like the Tokenometer/tokenradar app."
}

Write-Host "Preparing Tokenometer deployment to Hetzner..." -ForegroundColor Cyan
Write-Host "Server: ${ServerUser}@${ServerIp}" -ForegroundColor DarkCyan
Write-Host "Remote path: $ProjectPath" -ForegroundColor DarkCyan
Write-Host "Host port: $TokenometerPort" -ForegroundColor DarkCyan
if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    $PublicUrl = "http://${ServerIp}:${TokenometerPort}"
}
Write-Host "Public URL: $PublicUrl" -ForegroundColor DarkCyan

if ($CommitAndPush) {
    Write-Host "`nAdding, committing and pushing local changes..." -ForegroundColor Yellow
    Invoke-Checked "git" @("add", "-A")
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "No staged changes to commit." -ForegroundColor DarkYellow
    } else {
        Invoke-Checked "git" @("commit", "-m", $CommitMessage)
    }
    Invoke-Checked "git" @("push", $Remote, $Branch)
} else {
    Write-Host "`nSkipping commit/push. Use -CommitAndPush to publish local changes first." -ForegroundColor Yellow
}

$repoUrl = (& git remote get-url $Remote).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoUrl)) {
    Fail "Could not read git remote URL for $Remote."
}

$sshArgs = @()
if (![string]::IsNullOrWhiteSpace($IdentityFile)) {
    if (!(Test-Path $IdentityFile)) {
        Fail "IdentityFile not found: $IdentityFile"
    }
    $sshArgs += @("-i", $IdentityFile)
}
$sshArgs += @("-A", "${ServerUser}@${ServerIp}")

$remoteScript = @"
set -euo pipefail

PROJECT_PATH='$ProjectPath'
BRANCH='$Branch'
REPO_URL='$repoUrl'
TOKENOMETER_PORT='$TokenometerPort'
TOKENOMETER_PUBLIC_URL='$PublicUrl'
SERVER_ACTION_ALLOWED_ORIGINS='${ServerIp}:${TokenometerPort}'

case "`$PROJECT_PATH" in
  *ai-radar*|/opt/ai-radar|/opt/ai-radar/*)
    echo "ABORT: refusing to deploy Tokenometer into ai-radar path: `$PROJECT_PATH" >&2
    exit 1
    ;;
esac

if [ "`$(basename "`$PROJECT_PATH")" = "ai-radar" ]; then
  echo "ABORT: remote basename is ai-radar." >&2
  exit 1
fi

if [ ! -d "`$PROJECT_PATH/.git" ]; then
  echo "Creating isolated Tokenometer checkout at `$PROJECT_PATH"
  mkdir -p "`$PROJECT_PATH"
  git clone --branch "`$BRANCH" "`$REPO_URL" "`$PROJECT_PATH"
fi

cd "`$PROJECT_PATH"

if [ -f package.json ] && ! grep -q '"name": "tokenradar"' package.json; then
  echo "ABORT: remote path does not contain Tokenometer/tokenradar." >&2
  exit 1
fi

touch .tokenometer-root
chmod +x deploy/deploy.sh
TOKENOMETER_PORT="`$TOKENOMETER_PORT" TOKENOMETER_PUBLIC_URL="`$TOKENOMETER_PUBLIC_URL" SERVER_ACTION_ALLOWED_ORIGINS="`$SERVER_ACTION_ALLOWED_ORIGINS" BRANCH="`$BRANCH" ./deploy/deploy.sh
"@

$remoteScript = $remoteScript -replace "`r", ""

Write-Host "`nRunning remote deployment in isolated Tokenometer path..." -ForegroundColor Yellow
& ssh @sshArgs $remoteScript
if ($LASTEXITCODE -ne 0) {
    Fail "Remote deployment failed."
}

Write-Host "`nTokenometer deployment completed." -ForegroundColor Green
Write-Host "Expected URL before reverse proxy: $PublicUrl" -ForegroundColor Cyan
