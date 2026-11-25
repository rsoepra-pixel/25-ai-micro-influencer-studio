#!/usr/bin/env python3
"""rakit.py <folder-langkah> <folder-audio> <awalan> <keluar.mp4>
Merakit gambar langkah-0..N dan audio <awalan>0..N.mp3 menjadi satu video:
tiap gambar tampil tepat sebelum kalimatnya mulai dibacakan."""
import subprocess, sys, os

dir_l, dir_a, awalan, keluar = sys.argv[1:5]
n = len([f for f in os.listdir(dir_l) if f.startswith("langkah-")])
JEDA, X, AWAL, AKHIR = 0.4, 0.35, 0.4, 0.8   # jeda antar kalimat, lama crossfade

def dur(f):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))

audio = [os.path.join(dir_a, f"{awalan}{i}.mp3") for i in range(n)]
d = [dur(a) for a in audio]
mulai, t = [], AWAL
for x in d:
    mulai.append(t); t += x + JEDA
total = t - JEDA + AKHIR

# Gambar ke-i mulai muncul (crossfade) 0.25 dtk sebelum kalimatnya.
ganti = [0.0] + [mulai[i] - 0.25 for i in range(1, n)]
lama = [(ganti[i + 1] if i + 1 < n else total) - ganti[i] + (X if i + 1 < n else 0) for i in range(n)]

cmd = ["ffmpeg", "-y", "-loglevel", "error"]
for i in range(n):
    cmd += ["-loop", "1", "-framerate", "30", "-t", f"{lama[i]:.3f}", "-i", os.path.join(dir_l, f"langkah-{i}.png")]
for a in audio:
    cmd += ["-i", a]
f = "".join(f"[{i}:v]scale=1920:1080,setsar=1,format=yuv420p,fps=30[s{i}];" for i in range(n))
prev = "s0"
for i in range(1, n):
    f += f"[{prev}][s{i}]xfade=transition=fade:duration={X}:offset={ganti[i]:.3f}[x{i}];"
    prev = f"x{i}"
for i in range(n):
    f += f"[{n + i}:a]adelay={int(mulai[i] * 1000)}:all=1[a{i}];"
f += "".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000[a]"
cmd += ["-filter_complex", f, "-map", f"[{prev}]", "-map", "[a]", "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", keluar]
subprocess.check_call(cmd)
print(f"{keluar}: {total:.1f} dtk; kalimat mulai di", [round(m, 1) for m in mulai])
