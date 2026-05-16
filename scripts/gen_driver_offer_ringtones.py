#!/usr/bin/env python3
"""
Generate driver ride-offer alert WAVs (mono 44.1kHz).
Uber/Bolt-style: urgent two-tone dispatch + bright triple pings (loops cleanly).
"""
from __future__ import annotations

import math
import os
import struct
import wave

SR = 44100


def envelope(i: int, n: int, attack: float = 0.008, release: float = 0.1) -> float:
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e = 1.0
    if i < a:
        e = i / a
    if i > n - r - 1:
        e *= max(0.0, (n - i - 1) / r)
    return e


def write_wav(path: str, samples: list[float]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        for s in samples:
            v = max(-1.0, min(1.0, s))
            w.writeframes(struct.pack("<h", int(v * 32767)))


def silence(sec: float) -> list[float]:
    return [0.0] * int(SR * sec)


def tone_burst(ms: float, freq: float, amp: float, attack: float = 0.006, release: float = 0.08) -> list[float]:
    n = int(SR * (ms / 1000.0))
    out: list[float] = []
    for i in range(n):
        t = i / SR
        e = envelope(i, n, attack, release) * amp
        # Slight harmonic for phone-speaker presence
        s = 0.78 * math.sin(2 * math.pi * freq * t)
        s += 0.18 * math.sin(2 * math.pi * freq * 1.98 * t)
        s += 0.06 * math.sin(2 * math.pi * freq * 2.5 * t)
        out.append(e * s)
    return out


def uber_dispatch(duration: float = 0.72, amp: float = 0.34) -> list[float]:
    """
    Uber-like: low → high two-tone punch, short gap, repeat (reads urgent on loop).
    """
    out: list[float] = []
    for _ in range(2):
        out.extend(tone_burst(0.11, 523.25, amp * 0.92))  # C5
        out.extend(silence(0.028))
        out.extend(tone_burst(0.14, 783.99, amp))  # G5
        out.extend(silence(0.055))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def bolt_triple_ping(duration: float = 0.58, amp: float = 0.36) -> list[float]:
    """
    Bolt-like: three bright ascending pings, tight spacing.
    """
    freqs = [880.0, 988.0, 1174.7]
    out: list[float] = []
    for f in freqs:
        out.extend(tone_burst(0.075, f, amp * 0.95, 0.004, 0.05))
        out.extend(silence(0.032))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def bolt_pulse(duration: float = 0.62, amp: float = 0.33) -> list[float]:
    """Bolt variant: double-hit pulse (da-da) then high ping."""
    out: list[float] = []
    out.extend(tone_burst(0.08, 740.0, amp))
    out.extend(silence(0.04))
    out.extend(tone_burst(0.08, 740.0, amp * 0.88))
    out.extend(silence(0.045))
    out.extend(tone_burst(0.12, 1046.5, amp * 1.05))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def uber_cadence(duration: float = 0.68, amp: float = 0.32) -> list[float]:
    """Uber variant: rapid low-high-low-high (dispatch cadence)."""
    pattern = [(0.07, 622.0), (0.07, 932.0), (0.06, 622.0), (0.09, 932.0)]
    out: list[float] = []
    for ms, f in pattern:
        out.extend(tone_burst(ms, f, amp))
        out.extend(silence(0.025))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def uber_rise(duration: float = 0.65, amp: float = 0.3) -> list[float]:
    """Uber variant: quick upward sweep into settle tone."""
    n = int(SR * duration)
    out: list[float] = []
    f0, f1 = 480.0, 988.0
    settle_start = int(0.42 * n)
    for i in range(n):
        t = i / SR
        e = envelope(i, n, 0.01, 0.14) * amp
        if i < settle_start:
            f = f0 + (f1 - f0) * (i / max(settle_start - 1, 1))
        else:
            f = 880.0
        s = math.sin(2 * math.pi * f * t)
        if i >= settle_start:
            s *= 0.85 + 0.15 * math.sin(2 * math.pi * 8 * t)
        out.append(e * s)
    return out


def bolt_beacon(duration: float = 0.55, amp: float = 0.38) -> list[float]:
    """Bolt variant: extra-bright pings for noisy cabins."""
    freqs = [988.0, 1174.7, 1318.5]
    out: list[float] = []
    for f in freqs:
        out.extend(tone_burst(0.065, f, amp, 0.003, 0.04))
        out.extend(silence(0.022))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def uber_soft(duration: float = 0.75, amp: float = 0.26) -> list[float]:
    """Softer Uber-style — still two-tone, lower amplitude."""
    out: list[float] = []
    out.extend(tone_burst(0.12, 440.0, amp))
    out.extend(silence(0.04))
    out.extend(tone_burst(0.15, 659.25, amp * 1.05))
    out.extend(silence(0.12))
    out.extend(tone_burst(0.1, 523.25, amp * 0.9))
    out.extend(silence(0.04))
    out.extend(tone_burst(0.12, 783.99, amp))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def bolt_shimmer(duration: float = 0.6, amp: float = 0.31) -> list[float]:
    """Bolt variant: layered high shimmer between pings."""
    base = bolt_triple_ping(0.35, amp * 0.7)
    n = int(SR * duration)
    out = list(base)
    for i in range(len(out), n):
        t = i / SR
        e = envelope(i, n, 0.02, 0.15) * amp * 0.35
        s = math.sin(2 * math.pi * 1200 * t) + 0.4 * math.sin(2 * math.pi * 1500 * t)
        out.append(e * s * 0.25)
    return out[:n]


def main() -> None:
    root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "frontend", "assets", "sounds")
    )
    mapping = {
        "driver_offer.wav": uber_dispatch,  # classic — default Uber-style
        "driver_offer_transit.wav": bolt_triple_ping,  # transit — Bolt-style
        "driver_offer_pulse.wav": bolt_pulse,
        "driver_offer_signal.wav": uber_cadence,
        "driver_offer_horizon.wav": uber_rise,
        "driver_offer_beacon.wav": bolt_beacon,
        "driver_offer_chime.wav": uber_soft,
        "driver_offer_aurora.wav": bolt_shimmer,
    }
    for name, fn in mapping.items():
        path = os.path.join(root, name)
        write_wav(path, fn())
        print("Wrote", path)
    print("Done — Uber/Bolt-style driver offer ringtones.")


if __name__ == "__main__":
    main()
