// Menyusun SATU query baca-saja yang memeriksa apakah objek dari setiap
// migrasi di supabase/migrations/ benar-benar ada di database.
//
// KENAPA: migrasi dijalankan manual (CLAUDE.md jebakan #5), dan 18 Nov 2026
// dua sudah ketahuan tidak pernah diterapkan — 0060 (brand_blueprints) dan
// 0056 (storyboards.ref_photo_urls) — masing-masing baru ketahuan saat
// pelanggan menekan tombol. Query ini menemukannya sebelum itu.
//
// Yang dikenali dari teks: tabel, kolom, fungsi, view, index, trigger,
// policy, jadwal cron, dan kunci service_config yang di-insert. Perubahan
// DATA (update baris katalog, isi kolom) tidak terdeteksi — hasil kosong
// bukan bukti semua isi migrasi berjalan.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const dir = "supabase/migrations";
const baris = [];
for (const f of readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
  const sql = readFileSync(`${dir}/${f}`, "utf8").replace(/--[^\n]*/g, "");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi))
    baris.push([f, "tabel", m[1].toLowerCase(), null]);
  for (const blok of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi))
    for (const c of blok[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi))
      baris.push([f, "kolom", blok[1].toLowerCase(), c[1].toLowerCase()]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi))
    baris.push([f, "fungsi", m[1].toLowerCase(), null]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi))
    baris.push([f, "view", m[1].toLowerCase(), null]);
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi))
    baris.push([f, "index", m[1].toLowerCase(), null]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([a-z_][a-z0-9_]*)[\s\S]*?\son\s+(?:(?:public|auth|storage)\.)?([a-z_][a-z0-9_]*)/gi))
    // Skema auth/storage dilewati supaya `on auth.users` terbaca sebagai
    // tabel "users", bukan "auth" (positif palsu di run pertama).
    baris.push([f, "trigger", m[2].toLowerCase(), m[1].toLowerCase()]);
  for (const m of sql.matchAll(/create\s+policy\s+"?([a-z_][a-z0-9_ ]*?)"?\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi))
    baris.push([f, "policy", m[2].toLowerCase(), m[1]]);
  for (const m of sql.matchAll(/cron\.schedule\(\s*'([^']+)'/gi))
    baris.push([f, "cron", m[1], null]);
  for (const m of sql.matchAll(/insert\s+into\s+(?:public\.)?service_config[^;]*?values\s*\(\s*'([a-z0-9_]+)'/gi))
    baris.push([f, "config", m[1], null]);
}
const q = (s) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const values = baris.map((b) => `(${b.map(q).join(",")})`).join(",\n  ");
const out = `-- DIHASILKAN scripts/gen-cek-skema.mjs — jangan diedit tangan. Baca-saja.
with harap(berkas, jenis, nama, kolom) as (values
  ${values}
)
select berkas, jenis, nama, kolom
from harap h
where case h.jenis
  when 'tabel' then not exists (select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=h.nama)
  when 'kolom' then not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=h.nama and c.column_name=h.kolom)
  when 'fungsi' then not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=h.nama)
  when 'view' then not exists (select 1 from information_schema.views v where v.table_schema='public' and v.table_name=h.nama)
  when 'index' then not exists (select 1 from pg_indexes i where i.indexname=h.nama)
  when 'trigger' then not exists (select 1 from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and g.tgname=h.kolom and c.relname=h.nama)
  when 'policy' then not exists (select 1 from pg_policies pl where pl.tablename=h.nama and pl.policyname=h.kolom)
  when 'cron' then not exists (select 1 from cron.job j where j.jobname=h.nama)
  when 'config' then not exists (select 1 from public.service_config sc where sc.key=h.nama)
end
order by berkas, jenis, nama;
`;
mkdirSync("supabase/checks", { recursive: true });
writeFileSync("supabase/checks/cek-skema.sql", out);
console.log(`${baris.length} objek dari ${new Set(baris.map((b) => b[0])).size} berkas migrasi`);
