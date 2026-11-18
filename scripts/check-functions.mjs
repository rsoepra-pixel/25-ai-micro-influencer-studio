// `deno check` untuk setiap edge function — sama dengan workflow
// .github/workflows/check-functions.yml, supaya error tipe ketahuan sebelum
// PR dibuka, bukan saat deploy setelah merge.
//
// Berhenti di fungsi pertama yang gagal dan menyebut namanya.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const deno = process.env.DENO_BIN || "deno";
const cek = spawnSync(deno, ["--version"], { stdio: "ignore" });
if (cek.error || cek.status !== 0) {
  console.error(
    "deno tidak terpasang — pasang dari deno.land (https://deno.land), " +
      "atau arahkan DENO_BIN ke binary deno yang ada.",
  );
  process.exit(1);
}

const akar = "supabase/functions";
const fungsi = readdirSync(akar, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(akar, d.name, "index.ts")))
  .map((d) => d.name)
  .sort();

for (const fn of fungsi) {
  console.log(`— deno check ${fn}`);
  // package.json di akar repo membuat Deno menuntut node_modules untuk impor
  // `npm:`; Edge Runtime tidak begitu. Sama dengan env di workflow-nya.
  const r = spawnSync(deno, ["check", join(akar, fn, "index.ts")], {
    stdio: "inherit", env: { ...process.env, DENO_NO_PACKAGE_JSON: "1" },
  });
  if (r.status !== 0) {
    console.error(`\nType check gagal di fungsi '${fn}' (${akar}/${fn}/index.ts).`);
    process.exit(r.status || 1);
  }
}
console.log(`\nSemua ${fungsi.length} fungsi lolos deno check.`);
