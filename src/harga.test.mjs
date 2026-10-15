import test from "node:test";
import assert from "node:assert/strict";
import {
  setHarga, setTampilan, tampilanAktif, hargaLabel, hargaLabelLain,
  bulatkanRupiah, biayaNaskahLabel, biayaNaskahUsd, bagiAdegan,
} from "./harga.js";

test("tanpa kurs selalu dolar, apa pun pilihannya", () => {
  setHarga({});
  setTampilan("idr");
  assert.equal(tampilanAktif(), "usd");
  assert.equal(hargaLabel(0.04), "$0.04");
  assert.equal(hargaLabel(0.003), "$0.003");
  assert.equal(hargaLabelLain(0.04), null);
});

test("dengan kurs dan pilihan rupiah, harga kecil dibulatkan ke puluhan", () => {
  setHarga({ idr_per_usd: 25714 });
  setTampilan("idr");
  assert.equal(tampilanAktif(), "idr");
  assert.equal(hargaLabel(0.003), "Rp 80");       // 77 → 80
  assert.equal(hargaLabel(0.04), "Rp 1.000");     // 1.028 → ratusan
  assert.equal(hargaLabel(0.56), "Rp 14.400");    // 14.400
  assert.equal(hargaLabel(6.7), "Rp 172.000");    // ribuan
  assert.equal(hargaLabelLain(0.56), "$0.56");
});

test("pilihan dolar tetap dihormati walau kurs ada", () => {
  setHarga({ idr_per_usd: 25714 });
  setTampilan("usd");
  assert.equal(hargaLabel(0.56), "$0.56");
  assert.equal(hargaLabelLain(0.56), "Rp 14.400");
});

test("nol selalu 'gratis', dan pembulatan tidak pernah menghasilkan nol untuk harga > 0", () => {
  setHarga({ idr_per_usd: 25714 });
  setTampilan("idr");
  assert.equal(hargaLabel(0), "gratis");
  assert.equal(bulatkanRupiah(3), 10);
  assert.equal(bulatkanRupiah(0), 0);
});

test("biaya naskah dari tarif token: ≈ Rp 40 pada tarif qwen-plus", () => {
  setHarga({ idr_per_usd: 25714, text_price_per_1k_in_usd: 0.0004, text_price_per_1k_out_usd: 0.0012 });
  setTampilan("idr");
  assert.ok(Math.abs(biayaNaskahUsd() - 0.00155) < 0.0001);
  assert.equal(biayaNaskahLabel(), " · ≈ Rp 40");
  setHarga({ idr_per_usd: 25714 });
  assert.equal(biayaNaskahLabel(), "");
});

test("bagiAdegan: total detik jadi adegan 5 detik, minimal satu adegan", () => {
  assert.deepEqual(bagiAdegan(15), [5, 5, 5]);
  assert.deepEqual(bagiAdegan(30), [5, 5, 5, 5, 5, 5]);
  assert.deepEqual(bagiAdegan(3), [5]);
  assert.deepEqual(bagiAdegan(0), [5]);
});
