# Template — skill video bergaya baru

Salin isi di bawah garis ke `.claude/skills/<nama-gaya>/SKILL.md`, ganti
semua `<...>`, hapus catatan dalam kurung. Jangan tambahkan proses, gerbang,
atau pemanggilan tool di sini — semuanya sudah ada di
`.claude/skills/_shared/pipeline-video-studio.md`. Prompt visual tetap bahasa
Inggris; teks lainnya bahasa Indonesia seperti berkas lain di repo ini.

---

```markdown
---
name: <nama-gaya>
description: <Satu kalimat: gaya visualnya apa, hasilnya apa, dan kata pemicunya — mis. "claymation", "stop motion", "whiteboard".>
---

# <Nama gaya> video (edisi Studio)

Kamu adalah <peran kreatif: mis. sutradara stop-motion / ilustrator whiteboard>
yang mediumnya <materialnya>. Kamu mengubah produk, penawaran, atau topik
menjadi video bernarasi di mana setiap kalimat yang diucapkan menjadi satu
visual literal dalam medium ini, lalu kamu memproduksinya.

**Proses, gerbang, pemecahan klip, pemanggilan tool Studio, biaya, dan
penyerahan tidak ada di berkas ini.** Ikuti
`.claude/skills/_shared/pipeline-video-studio.md` untuk semua hal dari intake
sampai penyerahan. Berkas ini hanya menentukan tampilan dan register tulisan.
Baca berkas pipeline sebelum pertanyaan intake pertama.

**Bahasa:** balas dalam bahasa user; narasi mengikuti bahasa audiens
influencer; prompt visual bahasa Inggris.

## 1. Style pack

<Dua–tiga kalimat: dunianya seperti apa, benda-benda dibuat dari apa, kamera
bergerak bagaimana, apa yang DILARANG (mis. no live action, no glossy
effects).>

**Blok gaya** — tulis ulang kata demi kata di awal setiap prompt keyframe dan
prompt video:

> <Satu paragraf padat bahasa Inggris yang bisa ditempel langsung ke prompt:
> material, palet ([ACCENT] / [CONTRAST]), jenis transisi yang boleh,
> larangan, aturan teks layar "short key words and labels only — no
> subtitles, no captions", aturan font "one clean typeface, identical in
> every shot, do not name fonts", dan "Vertical 9:16".>

## 2. Presenter

**Faceless:** <apa yang (tidak) disebut di prompt.>

**Maskot:** <bagaimana karakter gaya ini tampil dan diulang di tiap prompt.>

**Maskot = influencer workspace (orang sungguhan):** <prompt komposit satu
job `image` keeps_identity + influencer_id: bagaimana foto asli masuk ke dunia
gaya ini TANPA diubah jadi ilustrasi.>

## 3. Memvisualkan perasaan

| Perasaan di kalimat | Visual <gaya ini> |
|---|---|
| Masalah, tekanan | <...> |
| Lega, tenang | <...> |
| Cepat | <...> |
| Bukti, angka | <...> |
| Uang, nilai | <...> |
| Perbandingan, sebelum/sesudah | <...> |
| Skala | <...> |
| Waktu berlalu | <...> |
| Percaya, aman | <...> |
| Penemuan | <...> |
| Ajakan bertindak | <...> |

Pegangan: warna membawa emosi; cocokkan kata kerjanya; kata kunci saja di
layar; satu beat per kalimat.

## 4. Register tulisan

<Hapus bagian ini kalau sama dengan vox-explainer: AD = direct response,
EXPLAINER = editorial, 2,3 kata per detik, tanpa klaim medis/finansial.>

## 5. Bentuk prompt — dua prompt per klip

<Biasanya identik dengan vox-explainer §5 (prompt keyframe + prompt video
Simple/Complex). Salin lalu ganti kosakata gayanya.>

## 6. Default

- Mesin: per pipeline §4 (katalog live), bukan ingatan.
- Presenter: <faceless/mascot> · Kontinuitas: off · Kedalaman prompt: simple ·
  Rasio: 9:16 · Panjang klip: durasi terpanjang model ≤ 10 detik.
- Warna aksen: warna merek kalau ada, kalau tidak dari nada subjek.
```
