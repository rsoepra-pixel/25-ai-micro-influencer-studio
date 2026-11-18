// Uji aturan angka performa. Jalankan: node --test src/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAngka, terakhirPerKolom, angkaPerKonten, ringkasKelompok, urutFollower, hariIniLokal, tanggalPendek } from "./angka-post.js";

test("kosong = null, bukan 0", () => {
  assert.deepEqual(parseAngka(""), { nilai: null });
  assert.deepEqual(parseAngka("   "), { nilai: null });
  assert.deepEqual(parseAngka(null), { nilai: null });
  assert.deepEqual(parseAngka("0"), { nilai: 0 });
});

test("pemisah ribuan diterima, singkatan ditolak", () => {
  assert.deepEqual(parseAngka("1200"), { nilai: 1200 });
  assert.deepEqual(parseAngka("1.200"), { nilai: 1200 });
  assert.deepEqual(parseAngka("12,345,678"), { nilai: 12345678 });
  assert.ok(parseAngka("1,2rb").error);
  assert.ok(parseAngka("1.2K").error);
  assert.ok(parseAngka("1,2").error);
  assert.ok(parseAngka("-5").error);
});

test("placeholder: nilai terakhir per kolom, melewati null", () => {
  const rows = [
    { views: null, follows: 7 },
    { views: 900, follows: 3 },
  ];
  const t = terakhirPerKolom(rows);
  assert.equal(t.views, 900);
  assert.equal(t.follows, 7);
  assert.equal(t.likes, null);
});

test("angka per konten: dua platform dijumlah, null tetap null", () => {
  const per = angkaPerKonten([
    { content_item_id: "a", views: 100, follows: null },
    { content_item_id: "a", views: 50, follows: null },
    { content_item_id: "b", views: null, follows: 0 },
    { content_item_id: null, views: 999, follows: 999 },
  ]);
  assert.deepEqual(per.a, { views: 150, follows: null });
  assert.deepEqual(per.b, { views: null, follows: 0 });
});

test("ringkasan kelompok menghitung yang tercatat saja", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const r = ringkasKelompok(items, {
    biaya: { a: 0.5 },
    klik: { b: 3 },
    angka: { a: { views: 100, follows: null }, b: { views: null, follows: 0 } },
  });
  assert.equal(r.n, 3);
  assert.equal(r.biaya, 0.5);
  assert.equal(r.klik, 3);
  assert.equal(r.views, 100); assert.equal(r.nViews, 1);
  assert.equal(r.follows, 0); assert.equal(r.nFollows, 1);
  const kosong = ringkasKelompok([{ id: "z" }], { biaya: {}, klik: {}, angka: {} });
  assert.equal(kosong.biaya, null);
  assert.equal(kosong.follows, null);
  assert.equal(kosong.klik, 0);
});

test("urutan: follower terbanyak dulu, belum dicatat di bawah nol", () => {
  const rows = [{ follows: null }, { follows: 0 }, { follows: 12 }, { follows: 3 }];
  assert.deepEqual(rows.sort(urutFollower).map((r) => r.follows), [12, 3, 0, null]);
});

test("tanggal", () => {
  assert.equal(hariIniLokal(new Date(2026, 10, 8)), "2026-11-08");
  assert.equal(tanggalPendek("2026-11-18"), "18 Nov 2026");
  assert.equal(tanggalPendek(null), "");
});
