// Uji salinan klien `job_failure_kind`. Jalankan: node --test src/
//
// Contoh pesannya diambil dari bentuk error sungguhan di production_jobs
// (dikutip di komentar 0057), bukan dikarang agar cocok dengan regex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jenisGagal, kalimatGagal } from "./gagal.js";

test("config: saldo provider habis", () => {
  assert.equal(jenisGagal("User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."), "config");
  assert.equal(jenisGagal("Model not exist."), "config");
});

test("policy: ditolak penyaring konten", () => {
  assert.equal(jenisGagal('{"detail":[{"type":"content_policy_violation","msg":"flagged"}]}'), "policy");
});

test("input: 422 dari fal", () => {
  assert.equal(jenisGagal('fal 422: {"detail":[{"loc":["body","image_url"],"msg":"field required","type":"missing"}]}'), "input");
});

test("provider: teks lain apa pun", () => {
  assert.equal(jenisGagal("Internal server error"), "provider");
  assert.equal(jenisGagal("timeout menunggu antrean"), "provider");
});

test("kosong atau null bukan kegagalan yang bisa digolongkan", () => {
  assert.equal(jenisGagal(null), null);
  assert.equal(jenisGagal(undefined), null);
  assert.equal(jenisGagal("   "), null);
});

test("kalimat: tiap jenis punya kalimat, jenis tak dikenal jatuh ke provider", () => {
  for (const k of ["config", "policy", "input", "provider"]) assert.ok(kalimatGagal(k).length > 20);
  assert.equal(kalimatGagal(null), kalimatGagal("provider"));
  assert.equal(kalimatGagal("entah"), kalimatGagal("provider"));
  assert.match(kalimatGagal("policy"), /penyaring konten/);
});
