"""Original 15-second score for the GateCue reel, synthesised from scratch (no samples, no licences).
120 BPM, A minor. Every visual cut in reel.ts lands on one of these hits."""
import numpy as np, wave

SR = 48000
DUR = 15.6
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
BEAT = .5
rng = np.random.default_rng(7)

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    s = sig[: N - i] * gain
    L[i:i + len(s)] += s * (1 - max(0, pan)); R[i:i + len(s)] += s * (1 + min(0, pan))

def env(n, a=.002, d=.2, curve=6):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * np.exp(-curve * t / d)
    return e

def note(m): return 440 * 2 ** ((m - 69) / 12)

def kick(big=False):
    n = int(SR * (.9 if big else .45)); t = np.arange(n) / SR
    f = 42 + (160 if big else 120) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, .001, .7 if big else .32, 5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * .25
    return np.tanh((s + click) * 1.6)

def clap():
    n = int(SR * .35); t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    # band-limited-ish: difference of smoothed noise
    k = np.convolve(nz, np.ones(6) / 6, "same"); nz = nz - k
    e = np.zeros(n)
    for o in (0, .011, .023): e += np.exp(-np.clip(t - o, 0, None) * 35) * (t >= o)
    return nz * e * .5

def hat(open_=False):
    n = int(SR * (.25 if open_ else .06)); t = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - np.convolve(nz, np.ones(3) / 3, "same")
    return nz * np.exp(-t * (18 if open_ else 90)) * .35

def pluck(m, dur=.35, bright=1.0):
    n = int(SR * dur); t = np.arange(n) / SR; f = note(m)
    s = sum((1 / k) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (6 + 5 * k / bright)) for k in range(1, 7))
    return s * env(n, .002, dur, 3) * .5

def stab(ms, dur=.3):
    n = int(SR * dur); t = np.arange(n) / SR
    s = np.zeros(n)
    for m in ms:
        f = note(m)
        for det in (-0.08, 0.08):
            ph = (f * (1 + det / 12)) * t
            s += 2 * (ph - np.floor(ph + .5))  # saw
    lp = np.convolve(s, np.ones(12) / 12, "same")
    return lp * env(n, .003, dur, 4) * .12

def pad(ms, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    s = np.zeros(n)
    for m in ms:
        for det in (-.12, 0, .12):
            s += np.sin(2 * np.pi * note(m) * (1 + det / 100) * t + det * 7)
    a = np.minimum(1, t / .02) * np.exp(-t * 1.1)
    return s * a * .05

def bass(m, dur):
    n = int(SR * dur); t = np.arange(n) / SR; f = note(m)
    s = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t)
    return np.tanh(s * 1.4) * env(n, .004, dur, 2.5) * .45

def whoosh(dur=.45, up=True):
    n = int(SR * dur); t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    w = np.linspace(2, 40, n) if up else np.linspace(40, 2, n)
    out = np.zeros(n); acc = 0.0
    for i in range(n):  # one-pole low-pass with a sweeping cutoff
        a = min(.9, w[i] / 60); acc += a * (nz[i] - acc); out[i] = acc
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * shape * .9

def riser(dur):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 200 * 2 ** (3 * t / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .15 + whoosh(dur)[:n] * .6
    return s * (t / dur) ** 2

def impact():
    n = int(SR * 1.6); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    nz = rng.standard_normal(n) * np.exp(-t * 9) * .4
    return np.tanh((sub + nz) * 1.3)

def glitch():
    n = int(SR * .28); s = np.zeros(n)
    seg = int(SR * .028)
    base = rng.standard_normal(seg) * .5 + np.sin(2 * np.pi * 880 * np.arange(seg) / SR) * .4
    for k in range(0, n - seg, seg): s[k:k + seg] = base * (1 - k / n) * (1 if (k // seg) % 2 == 0 else .4)
    return s

# ---------------- arrangement ----------------
# 0-2: hook. Impact on frame 1, glitch on the AM->PM flip, rising tension into the drop.
add(impact(), 0.0, 1.0)
add(kick(True), 0.0, .9)
add(pad([45, 57, 60, 64], 1.0), 0.0, .7)
add(pluck(76, .4), 0.5, .45, .2); add(pluck(81, .4), 0.5, .3, -.2)            # "AM" pops in
add(glitch(), 1.0, .6); add(kick(True), 1.0, .8); add(stab([57, 60, 64, 68]), 1.0, 1.0)  # "PM" (a sour G#)
add(riser(.55), 1.45, .9)
# 2-4: kinetic type. Four-on-the-floor, a chord stab on every word.
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]   # Am F C G
for i, t in enumerate([2.0, 2.5, 3.0, 3.5]):
    add(kick(), t, .95); add(stab(chords[i]), t, 1.1, (-.3, .3, -.2, .2)[i]); add(bass([33, 29, 36, 31][i], .48), t, 1)
    add(hat(), t + .25, .8, .3)
    add(whoosh(.3), t - .02, .35, (-.5, .5, -.5, .5)[i])
add(clap(), 2.5, .8); add(clap(), 3.5, .8)
# 4-6: shape play. Half-time; the dot bounces (falling plucks), the ring ticks down, then bursts.
add(kick(), 4.0, .9); add(pad([45, 52, 57, 64], 2.0), 4.0, .6)
add(pluck(84, .3), 4.5, .5); add(pluck(79, .3), 5.0, .4)
for k in range(8): add(hat(), 5.0 + k * .0625, .45 + k * .05, .4 * ((-1) ** k))        # countdown ticks
add(impact(), 5.5, .55); add(kick(True), 5.5, .7)
for k, m in enumerate([69, 72, 76, 79, 81, 84]): add(pluck(m, .25), 5.5 + k * .04, .35, -.6 + k * .24)
# 6-8: six skies, one pluck per sky on triplets, climbing.
for k, m in enumerate([57, 60, 64, 67, 72, 76]):
    t = 6.0 + k * (2 / 6); add(pluck(m, .5, 1.6), t, .75, (-.4, .4)[k % 2]); add(pluck(m + 12, .3), t, .25)
for k in range(4): add(kick(), 6.0 + k * BEAT, .85); add(bass([33, 33, 29, 31][k], .45), 6.0 + k * BEAT, .9)
for k in range(8): add(hat(k % 2 == 1), 6.0 + k * .25, .5)
add(whoosh(.35), 7.8, .6)
# 8-11: camera move. Full groove.
add(impact(), 8.0, .5)
prog = [33, 33, 29, 29, 36, 36]
for k in range(6):
    t = 8.0 + k * BEAT
    add(kick(), t, .95); add(bass(prog[k], .24), t, 1); add(bass(prog[k] + 12, .2), t + .25, .6)
    if k % 2 == 1: add(clap(), t, .85)
    for h in range(4): add(hat(h == 2), t + h * .125, .38 + .1 * (h % 2), .25 * (-1) ** h)
add(pad([45, 52, 57, 60, 64], 3.0), 8.0, .5)
for t in (8.5, 9.0, 9.5, 10.5): add(pluck(76, .3), t, .35, .3)                           # route stops
add(whoosh(.9), 9.6, .45)                                                                  # the plane
add(whoosh(.3), 10.8, .8)                                                                  # whip-pan
# 11-13.5: product. One stab per screen, riser into the logo.
for k in range(5):
    t = 11.0 + k * BEAT
    add(kick(), t, .95); add(stab(chords[k % 4], .22), t, 1.0, (-.25, .25)[k % 2]); add(bass([33, 29, 36, 31, 33][k], .45), t, .9)
    add(hat(), t + .25, .7)
    if k % 2 == 1: add(clap(), t, .8)
add(riser(1.0), 12.5, 1.0)
for k in range(8): add(clap(), 13.0 + k * .0625, .25 + k * .06)                            # snare roll
# 13.5: the logo lands. Big hit, then a clean A minor add9 ring-out.
add(impact(), 13.5, 1.0); add(kick(True), 13.5, 1.0)
add(pad([45, 57, 64, 67, 71, 76], 2.1), 13.5, 1.2)
add(pluck(81, .8, 1.2), 13.62, .5, .2); add(pluck(88, .6), 13.95, .25, -.2)                # the dot's bounce

# ---------------- master ----------------
# gentle stereo width + short room, then limit.
d = int(SR * .013)
R2 = R.copy(); R2[d:] += L[:-d] * .18; L2 = L.copy(); L2[d:] += R[:-d] * .18
room = np.zeros(N); tail = int(SR * .09)
mix = np.stack([L2, R2])
for dly, g in ((tail, .12), (tail * 2, .06)):
    mix[:, dly:] += mix[:, :-dly] * g
fade = np.ones(N); fn = int(SR * .5); fade[-fn:] = np.linspace(1, 0, fn)
mix *= fade
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) * 1.02
pcm = (mix.T * 32767).astype(np.int16)
with wave.open("score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("score.wav", DUR, "s")
