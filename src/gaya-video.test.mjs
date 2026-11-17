import test from "node:test";
import assert from "node:assert/strict";
import { GAYA_VIDEO, GAYA_BYTE_MAX, pasangGaya, gayaDariKontinuitas, framePrefixUntuk } from "./gaya-video.js";

const blen = (t) => new TextEncoder().encode(t).length;

test("setiap blok gaya muat anggaran byte per shot", () => {
  for (const g of GAYA_VIDEO) {
    assert.ok(blen(g.kontinuitas) <= GAYA_BYTE_MAX, `${g.key}: ${blen(g.kontinuitas)} byte > ${GAYA_BYTE_MAX}`);
  }
});

test("kunci gaya unik, gaya pertama tanpa blok (bawaan)", () => {
  assert.equal(new Set(GAYA_VIDEO.map((g) => g.key)).size, GAYA_VIDEO.length);
  assert.equal(GAYA_VIDEO[0].kontinuitas, "");
});

test("pasangGaya menempel sekali dan bisa dibaca balik", () => {
  const c = pasangGaya("vox", "red and teal accents");
  assert.equal(pasangGaya("vox", c), c);
  assert.equal(gayaDariKontinuitas(c).key, "vox");
  assert.equal(pasangGaya("nyata", "linen shirt"), "linen shirt");
  assert.equal(gayaDariKontinuitas("linen shirt").key, "nyata");
  assert.equal(framePrefixUntuk("linen shirt"), "");
  assert.ok(framePrefixUntuk(c).startsWith("Vox-style"));
});

// GAYA_SERVER di generate menyalin blok ini; kalau menyimpang, server tidak
// lagi mengenali awalannya dan blok gaya ikut dipangkas seperti kontinuitas biasa.
test("blok gaya sama persis dengan salinan server", async () => {
  const { readFile } = await import("node:fs/promises");
  const ts = await readFile(new URL("../supabase/functions/generate/index.ts", import.meta.url), "utf8");
  for (const g of GAYA_VIDEO.filter((x) => x.kontinuitas)) {
    assert.ok(ts.includes(JSON.stringify(g.kontinuitas)), `${g.key}: blok gaya tidak ditemukan di GAYA_SERVER`);
  }
});
