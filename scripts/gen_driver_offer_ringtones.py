#!/usr/bin/env python3
"""Generate short mono 44.1kHz WAV ringtones for driver ride-offer alerts (unique timbres)."""
from __future__ import annotations

import math
import os
import struct
import wave

SR = 44100


def envelope(i: int, n: int, attack: float = 0.02, release: float = 0.12) -> float:
    a = int(attack * SR)
    r = int(release * SR)
    e = 1.0
    if i < a:
        e = i / max(a, 1)
    if i > n - r - 1:
        e *= (n - i - 1) / max(r, 1)
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


def chirp_up(duration: float = 0.42, amp: float = 0.32) -> list[float]:
    n = int(SR * duration)
    out: list[float] = []
    f0, f1 = 440.0, 1020.0
    for i in range(n):
        t = i / SR
        f = f0 + (f1 - f0) * (i / max(n - 1, 1))
        e = envelope(i, n) * amp
        out.append(e * math.sin(2 * math.pi * f * t))
    return out


def dual_shimmer(duration: float = 0.46, amp: float = 0.28) -> list[float]:
    n = int(SR * duration)
    out: list[float] = []
    for i in range(n):
        t = i / SR
        e = envelope(i, n) * amp
        s = 0.52 * math.sin(2 * math.pi * 600 * t) + 0.38 * math.sin(2 * math.pi * 756 * t)
        s += 0.14 * math.sin(2 * math.pi * 1212 * t + t * 6.0)
        out.append(e * s)
    return out


def triple_ping(duration: float = 0.5, amp: float = 0.3) -> list[float]:
    out: list[float] = []
    seg = int(0.1 * SR)
    gap = int(0.038 * SR)
    for rep in range(3):
        f = 820.0 + 55 * rep
        for i in range(seg):
            t = i / SR
            e = (i / max(seg - 1, 1)) ** 0.55 * amp * 0.88
            e *= envelope(i, seg, 0.004, 0.06)
            out.append(e * math.sin(2 * math.pi * f * t))
        out.extend([0.0] * gap)
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def cadence_signal(duration: float = 0.42, amp: float = 0.33) -> list[float]:
    def burst(ms: float, f: float) -> list[float]:
        n = int(SR * (ms / 1000.0))
        arr: list[float] = []
        for i in range(n):
            t = i / SR
            e = envelope(i, n, 0.004, 0.025) * amp
            arr.append(e * math.sin(2 * math.pi * f * t))
        return arr

    out = burst(0.068, 740)
    out.extend([0.0] * int(0.032 * SR))
    out.extend(burst(0.165, 620))
    out.extend([0.0] * int(0.038 * SR))
    out.extend(burst(0.072, 880))
    target = int(SR * duration)
    while len(out) < target:
        out.append(0.0)
    return out[:target]


def main() -> None:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "assets", "sounds"))
    write_wav(os.path.join(root, "driver_offer_horizon.wav"), chirp_up())
    write_wav(os.path.join(root, "driver_offer_aurora.wav"), dual_shimmer())
    write_wav(os.path.join(root, "driver_offer_transit.wav"), triple_ping())
    write_wav(os.path.join(root, "driver_offer_signal.wav"), cadence_signal())
    print("Wrote:", root)


if __name__ == "__main__":
    main()
