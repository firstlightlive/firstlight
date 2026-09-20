# FIRST LIGHT — Windows snitch: reports when this laptop joins the HOME WiFi.
# Runs every 60s via Task Scheduler (see README-cloud.md).
# On home WiFi: instant alert + reminder every 30 min while connected.
# On any other network: heartbeat every 6 hours (silence = tamper = Level 4).

$HOMESSID = "REPLACE-WITH-HOME-SSID"
$TOPIC = "firstlight-cloud-REPLACE-WITH-RANDOM"
$STATE = "$env:USERPROFILE\.fl-snitch-state"
$HB = "$env:USERPROFILE\.fl-snitch-hb"

$ssidMatch = netsh wlan show interfaces | Select-String "SSID"
if ($null -eq $ssidMatch) { exit }
$SSID = ($ssidMatch.ToString().Split(':')[1]).Trim()
if (-not $SSID) { exit }

$now = Get-Date -Format "HH:mm"
function Post([string]$title, [string]$body) {
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$TOPIC" -Headers @{ Title = $title } -Body $body -TimeoutSec 15 } catch { }
}

if ($SSID -eq $HOMESSID) {
  $m = ""; $p = 0
  if (Test-Path $STATE) {
    $c = Get-Content $STATE
    if ($c.Count -ge 2) { $m = $c[0]; $p = [long]$c[1] }
  }
  $epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  if ($m -ne "home") {
    "home`n$epoch" | Set-Content $STATE
    Post "GUARD: WINDOWS LAPTOP IN HOUSE" "WINDOWS LAPTOP joined home WiFi at $now. 100 KM CYCLE DEBT OPENS. Declared sessions only — witness decides."
  } elseif (($epoch - $p) -ge 1800) {
    "home`n$epoch" | Set-Content $STATE
    Post "GUARD REMINDER: WINDOWS LAPTOP still home" "Still on home WiFi since $now. Debt stands unless the session was pre-declared."
  }
} else {
  if (Test-Path $STATE) { Remove-Item $STATE }
  $epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $old = 0
  if (Test-Path $HB) { $old = [long](Get-Content $HB) }
  if (($epoch - $old) -ge 21600) {
    "$epoch" | Set-Content $HB
    Post "guard-heartbeat (windows)" "alive — current network: $SSID"
  }
}
