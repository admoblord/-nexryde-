#!/usr/bin/env bash
# NexRyde Android production certification soak (60 minutes).
# Requires: adb device with com.nexryde.app installed; operator drives the manual test sequence.
#
# Usage:
#   bash frontend/scripts/android_production_soak.sh
#   bash frontend/scripts/android_production_soak.sh --duration-min 60
#
# Does NOT declare production ready unless every check passes at the end.

set -euo pipefail

PKG="com.nexryde.app"
DURATION_MIN=60
SAMPLE_EVERY_MIN=5
SERIAL="${ANDROID_SERIAL:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${ROOT}/build-output/soak-${STAMP}"
LOGCAT_PID=""

ADB=(adb)
if [[ -n "$SERIAL" ]]; then
  ADB=(adb -s "$SERIAL")
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration-min) DURATION_MIN="$2"; shift 2 ;;
    --serial) SERIAL="$2"; ADB=(adb -s "$SERIAL"); shift 2 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/soak_report.md"
METRICS_CSV="$OUT_DIR/metrics.csv"
LOGCAT_FILE="$OUT_DIR/logcat_nexryde.txt"
SUMMARY_JSON="$OUT_DIR/summary.json"

log() { echo "[soak $(date +%H:%M:%S)] $*"; }

cleanup() {
  if [[ -n "$LOGCAT_PID" ]] && kill -0 "$LOGCAT_PID" 2>/dev/null; then
    kill "$LOGCAT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

require_device() {
  local devices
  devices="$("${ADB[@]}" devices | awk 'NR>1 && $2=="device" {print $1}')"
  if [[ -z "$devices" ]]; then
    echo "FAIL: no Android device in 'device' state (adb devices empty)."
    echo "Connect a phone with USB debugging (or wifi adb), install NexRyde ($PKG), then re-run."
    exit 1
  fi
  if [[ -z "$SERIAL" ]]; then
    SERIAL="$(echo "$devices" | head -n1)"
    ADB=(adb -s "$SERIAL")
  fi
  if ! "${ADB[@]}" shell pm path "$PKG" >/dev/null 2>&1; then
    echo "FAIL: package $PKG not installed on $SERIAL"
    exit 1
  fi
  log "Device ready: $SERIAL package=$PKG"
}

sample_once() {
  local minute="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local mem_pss_kb=""
  mem_pss_kb="$("${ADB[@]}" shell dumpsys meminfo "$PKG" 2>/dev/null | awk '/TOTAL PSS:/{print $3; exit} /TOTAL\t/{print $2; exit}')"
  if [[ -z "$mem_pss_kb" ]]; then
    mem_pss_kb="$("${ADB[@]}" shell dumpsys meminfo "$PKG" 2>/dev/null | awk '/TOTAL/{print $2; exit}')"
  fi

  local cpu=""
  cpu="$("${ADB[@]}" shell top -n 1 -d 1 2>/dev/null | awk -v p="$PKG" '$0 ~ p {print $9; exit}')"

  local bat_pct="" bat_ua=""
  bat_pct="$("${ADB[@]}" shell dumpsys battery 2>/dev/null | awk '/level:/{print $2; exit}')"
  bat_ua="$("${ADB[@]}" shell dumpsys battery 2>/dev/null | awk '/current now:/{print $3; exit}')"

  local fgs_count=""
  fgs_count="$("${ADB[@]}" shell dumpsys activity services "$PKG" 2>/dev/null | grep -c 'DriverForegroundService' || true)"

  local overlay_wins=""
  overlay_wins="$("${ADB[@]}" shell dumpsys window windows 2>/dev/null | grep -ci 'nexryde\|Type=TYPE_APPLICATION_OVERLAY' || true)"

  local notif_count=""
  notif_count="$("${ADB[@]}" shell dumpsys notification --noredact 2>/dev/null | grep -c "$PKG" || true)"

  local activities=""
  activities="$("${ADB[@]}" shell dumpsys activity activities 2>/dev/null | grep -c "$PKG" || true)"

  # Logcat counters since soak start (from filtered file)
  local hb socket_re loc overlays alerts
  hb="$(rg -c 'driver/heartbeat|HEARTBEAT_|heartbeat_force' "$LOGCAT_FILE" 2>/dev/null || echo 0)"
  socket_re="$(rg -c 'SOCKET_RECONNECT|SOCKET_CONNECT_START|SOCKET_DISCONNECTED' "$LOGCAT_FILE" 2>/dev/null || echo 0)"
  loc="$(rg -c 'LOCATION_FIX|/location|location_upload' "$LOGCAT_FILE" 2>/dev/null || echo 0)"
  overlays="$(rg -c 'present_offer|present_offer_deduped' "$LOGCAT_FILE" 2>/dev/null || echo 0)"
  alerts="$(rg -c 'RideAlertManager|showRideAlert|native_offer' "$LOGCAT_FILE" 2>/dev/null || echo 0)"

  echo "${minute},${ts},${mem_pss_kb:-},${cpu:-},${bat_pct:-},${bat_ua:-},${fgs_count:-0},${overlay_wins:-0},${notif_count:-0},${activities:-0},${hb},${socket_re},${loc},${overlays},${alerts}" >>"$METRICS_CSV"

  log "t=${minute}m PSS=${mem_pss_kb:-?}kb cpu=${cpu:-?}% bat=${bat_pct:-?}% fgs=${fgs_count:-0} notif=${notif_count:-0} hb_logs=${hb} sock_logs=${socket_re}"
}

analyze() {
  python3 - <<'PY' "$METRICS_CSV" "$SUMMARY_JSON" "$REPORT" "$DURATION_MIN"
import csv, json, sys
from pathlib import Path

csv_path, summary_path, report_path, duration = sys.argv[1:5]
rows = list(csv.DictReader(open(csv_path)))
checks = []

def add(name, ok, detail):
    checks.append({"name": name, "pass": bool(ok), "detail": detail})

if not rows:
    add("samples", False, "no metric samples")
else:
    def num(key):
        out = []
        for r in rows:
            v = r.get(key, "")
            try:
                out.append(float(v))
            except Exception:
                pass
        return out

    pss = num("mem_pss_kb")
    cpu = num("cpu_pct")
    bat = num("battery_pct")
    fgs = num("fgs_count")

    if len(pss) >= 2:
        growth = pss[-1] - pss[0]
        # Allow small OS noise; flag >25% growth or >80MB absolute
        limit = max(pss[0] * 0.25, 80_000)
        add("no_memory_growth", growth <= limit, f"start={pss[0]} end={pss[-1]} delta={growth:.0f}kb limit={limit:.0f}")
    else:
        add("no_memory_growth", False, "insufficient PSS samples")

    if cpu:
        add("no_cpu_spikes", max(cpu) < 60.0, f"max_cpu={max(cpu)}%")
    else:
        add("no_cpu_spikes", False, "cpu samples missing (top parse)")

    if len(bat) >= 2:
        drain = bat[0] - bat[-1]
        # Soft gate: >25% drain in 60m on one charge is unreasonable for soak
        add("battery_reasonable", drain <= 25.0, f"start={bat[0]} end={bat[-1]} drain={drain}%")
    else:
        add("battery_reasonable", False, "battery samples missing")

    if fgs:
        add("one_foreground_service", max(fgs) <= 1 and fgs[-1] <= 1, f"fgs samples={fgs}")
    else:
        add("one_foreground_service", False, "fgs_count missing")

add("device_soak_duration", True, f"configured_minutes={duration}")

overall = all(c["pass"] for c in checks if c["name"] != "device_soak_duration")
# Still require soak wall-clock via sample count ≈ duration/5 + 1
expected = int(duration) // 5 + 1
add("full_duration_samples", len(rows) >= expected, f"samples={len(rows)} expected>={expected}")

overall = all(c["pass"] for c in checks)
Path(summary_path).write_text(json.dumps({"overall_pass": overall, "checks": checks, "rows": len(rows)}, indent=2))

lines = ["# NexRyde Android production soak report", "", f"Overall: {'PASS' if overall else 'FAIL'}", ""]
for c in checks:
    lines.append(f"- {'PASS' if c['pass'] else 'FAIL'}: {c['name']} — {c['detail']}")
lines += ["", "Manual operator checklist (must all be verified during soak):",
 "- No crashes / ANRs",
 "- One overlay only / bubble stable",
 "- One RideAlertManager / one socket / no duplicate listeners",
 "- Full-screen alert works",
 "- Driver state always correct",
 "- No duplicate notifications or ride offers",
 ""]
Path(report_path).write_text("\n".join(lines))
print("OVERALL", "PASS" if overall else "FAIL")
for c in checks:
    print(("PASS" if c["pass"] else "FAIL"), c["name"], c["detail"])
sys.exit(0 if overall else 1)
PY
}

main() {
  require_device
  echo "minute,iso_ts,mem_pss_kb,cpu_pct,battery_pct,battery_ua,fgs_count,overlay_wins,notif_count,activities,hb_log_hits,socket_log_hits,location_log_hits,overlay_log_hits,alert_log_hits" >"$METRICS_CSV"

  log "Starting logcat capture → $LOGCAT_FILE"
  "${ADB[@]}" logcat -c || true
  "${ADB[@]}" logcat -v threadtime \
    '*:S' \
    'ReactNativeJS:V' \
    'NexRyde:V' \
    'RideAlertManager:V' \
    'DriverForegroundService:V' \
    'DriverExperience:V' \
    'OverlayManager:V' >"$LOGCAT_FILE" 2>&1 &
  LOGCAT_PID=$!

  cat >"$OUT_DIR/OPERATOR_SEQUENCE.txt" <<EOF
NexRyde production soak — operator sequence (${DURATION_MIN} min)
Device: $SERIAL

0–10 min: Go online. Receive multiple offers. Accept/decline several.
10–20 min: Background app; return foreground repeatedly. Check bubble, FGS, notifications.
20–30 min: Start a real trip. Drive with location updates. Weak network + brief airplane + reconnect.
30–40 min: Continuous offers. Accept/decline repeatedly.
40–50 min: Leave online idle. Watch memory/CPU/battery/socket/heartbeat/location.
50–60 min: Go Offline → Online → offer → Accept → Complete trip.

Do not kill the soak script. Keep USB debugging connected.
EOF

  log "Operator sequence written to $OUT_DIR/OPERATOR_SEQUENCE.txt"
  log "SOAK START — ${DURATION_MIN} minutes. Drive the sequence on-device now."

  local end_ts total_sec elapsed next_sample minute
  total_sec=$((DURATION_MIN * 60))
  end_ts=$((SECONDS + total_sec))
  next_sample=0
  minute=0
  sample_once 0

  while (( SECONDS < end_ts )); do
    sleep 30
    elapsed=$((DURATION_MIN * 60 - (end_ts - SECONDS)))
    if (( elapsed < 0 )); then elapsed=0; fi
    # sample every SAMPLE_EVERY_MIN minutes
    if (( elapsed / 60 >= next_sample + SAMPLE_EVERY_MIN )); then
      next_sample=$((next_sample + SAMPLE_EVERY_MIN))
      minute=$next_sample
      sample_once "$minute"
    fi
    # keep device awake (soft)
    "${ADB[@]}" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  done

  # final sample
  sample_once "$DURATION_MIN"
  log "SOAK END — analyzing metrics"
  set +e
  analyze
  local rc=$?
  set -e
  log "Report: $REPORT"
  log "Metrics: $METRICS_CSV"
  log "Summary: $SUMMARY_JSON"
  if [[ $rc -eq 0 ]]; then
    log "AUTOMATED METRIC GATES: PASS"
    log "Production ready still requires operator checklist confirmation in $REPORT"
  else
    log "AUTOMATED METRIC GATES: FAIL — NOT production ready"
  fi
  exit "$rc"
}

main "$@"
