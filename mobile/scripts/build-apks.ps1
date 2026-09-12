# Build passenger + driver APKs for live and local API targets.
# Usage:
#   powershell -File mobile/scripts/build-apks.ps1
#   powershell -File mobile/scripts/build-apks.ps1 -LocalApiBase http://192.168.100.5:4000/api
#   powershell -File mobile/scripts/build-apks.ps1 -InstallLive

param(
    [string]$LiveApiBase = "https://www.can-rides.ca/api",
    [string]$LocalApiBase = "",
    [switch]$InstallLive
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "mobile"))) {
    $Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
}
$Mobile = Join-Path $Root "mobile"
$OutDir = Join-Path $Mobile "apks"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Resolve-LanApiBase {
    if ($LocalApiBase) { return $LocalApiBase }
    # Prefer real Wi-Fi / Ethernet LAN IPs; skip WSL / Hyper-V / APIPA.
    $candidates = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.IPAddress -notlike '172.1[6-9].*' -and
            $_.IPAddress -notlike '172.2[0-9].*' -and
            $_.IPAddress -notlike '172.3[0-1].*' -and
            $_.InterfaceAlias -notmatch 'vEthernet|WSL|Hyper-V|Loopback|Virtual'
        } |
        Sort-Object {
            if ($_.InterfaceAlias -match 'Wi-?Fi') { 0 }
            elseif ($_.InterfaceAlias -match 'Ethernet') { 1 }
            else { 2 }
        } |
        Select-Object -ExpandProperty IPAddress -Unique)
    $wifi = $candidates | Where-Object { $_ -like '192.168.*' } | Select-Object -First 1
    if (-not $wifi) { $wifi = $candidates | Select-Object -First 1 }
    if (-not $wifi) { $wifi = "192.168.100.5" }
    return "http://${wifi}:4000/api"
}

$LocalBase = Resolve-LanApiBase
Write-Host "Live API : $LiveApiBase"
Write-Host "Local API: $LocalBase"
Write-Host "Output   : $OutDir"

$apps = @(
    @{ Name = "passenger"; Dir = Join-Path $Mobile "apps\passenger" },
    @{ Name = "driver"; Dir = Join-Path $Mobile "apps\driver" }
)

$targets = @(
    @{ Suffix = "live"; Api = $LiveApiBase },
    @{ Suffix = "local"; Api = $LocalBase }
)

foreach ($app in $apps) {
    foreach ($t in $targets) {
        $label = "$($app.Name)-$($t.Suffix)"
        Write-Host "`n=== Building $label ===" -ForegroundColor Cyan
        Push-Location $app.Dir
        try {
            flutter build apk --release --dart-define="CANGO_API_BASE=$($t.Api)"
            if ($LASTEXITCODE -ne 0) { throw "flutter build failed for $label" }
            $built = Join-Path $app.Dir "build\app\outputs\flutter-apk\app-release.apk"
            $dest = Join-Path $OutDir "can-go-$($app.Name)-$($t.Suffix).apk"
            Copy-Item $built $dest -Force
            # Keep legacy release name pointing at live build.
            if ($t.Suffix -eq "live") {
                Copy-Item $built (Join-Path $OutDir "can-go-$($app.Name)-release.apk") -Force
            }
            Write-Host "Wrote $dest"
        }
        finally {
            Pop-Location
        }
    }
}

Write-Host "`nDone. APKs:" -ForegroundColor Green
Get-ChildItem $OutDir -Filter "*.apk" | Format-Table Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime -AutoSize

if ($InstallLive) {
    $adb = "D:\Android\Sdk\platform-tools\adb.exe"
    if (-not (Test-Path $adb)) {
        Write-Warning "adb not found; skip install"
        return
    }
    $dev = (& $adb devices | Select-String "`tdevice" | ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)
    if (-not $dev) {
        Write-Warning "No adb device; skip install"
        return
    }
    Write-Host "Installing live APKs on $dev ..."
    & $adb -s $dev install -r (Join-Path $OutDir "can-go-passenger-live.apk")
    & $adb -s $dev install -r (Join-Path $OutDir "can-go-driver-live.apk")
    & $adb -s $dev shell monkey -p com.gettransfer.passenger -c android.intent.category.LAUNCHER 1
}
