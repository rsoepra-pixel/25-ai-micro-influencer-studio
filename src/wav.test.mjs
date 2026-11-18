// Uji pengubah WAV: header harus benar, karena penyedia klon suara menolak
// berkas yang header-nya tidak sesuai panjang datanya.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, WAV_RATE } from "./wav.js";

test("encodeWav: header RIFF/WAVE mono 16-bit dan panjang data cocok", () => {
  const n = WAV_RATE; // 1 detik
  const s = new Float32Array(n).map((_, i) => Math.sin(i / 10));
  const v = new DataView(encodeWav(s));
  const teks = (o, l) => String.fromCharCode(...Array.from({ length: l }, (_, i) => v.getUint8(o + i)));
  assert.equal(teks(0, 4), "RIFF");
  assert.equal(teks(8, 4), "WAVE");
  assert.equal(v.getUint16(22, true), 1, "mono");
  assert.equal(v.getUint32(24, true), WAV_RATE);
  assert.equal(v.getUint16(34, true), 16, "16-bit");
  assert.equal(v.getUint32(40, true), n * 2, "panjang data");
  assert.equal(v.byteLength, 44 + n * 2);
});

test("encodeWav: sampel di luar -1..1 dipotong, bukan meluap", () => {
  const v = new DataView(encodeWav(new Float32Array([2, -2, 0])));
  assert.equal(v.getInt16(44, true), 0x7fff);
  assert.equal(v.getInt16(46, true), -0x8000);
  assert.equal(v.getInt16(48, true), 0);
});
