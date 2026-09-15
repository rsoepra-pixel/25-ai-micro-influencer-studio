-- Rapor model: berapa biaya SATU HASIL JADI, bukan berapa biaya satu panggilan.
--
-- KENAPA INI ADA
--
-- Katalog hanya punya `est_price_usd`, dan seluruh aplikasi mengurutkan model
-- dengan angka itu — dropdown Production Studio, wizard UGC, Storyboard, dan
-- `list_models` di server MCP. Semuanya menjawab "mana yang paling murah
-- DIPANGGIL". Yang sebenarnya ditanya orang saat menekan tombol adalah "mana
-- yang paling murah SAMPAI JADI".
--
-- Dua angka itu bisa berbeda jauh. Dari 156 job pertama (Agu–Sep 2026):
--
--   kling-video/v3/pro/image-to-video    8 dicoba, 1 jadi
--                                        katalog $0,168/detik
--                                        $10,64 per hasil yang benar-benar ada
--   kling-video/v2.5-turbo/pro/i2v       4 dicoba, 4 jadi
--                                        $0,35 per hasil
--
-- Katalog menyebut keduanya sekelas premium. Rekamannya tidak.
--
-- TAPI "SERING GAGAL" BUKAN BERARTI "MODELNYA JELEK"
--
-- Ini bagian yang paling mudah salah dibaca, dan kalau salah, akibatnya kita
-- menyingkirkan model yang sebenarnya baik-baik saja. Ketujuh kegagalan Kling
-- v3 di atas TIDAK SATU PUN berasal dari modelnya:
--
--   4 job  prompt tiap shot melebihi batas 512 di `multi_prompt`
--   2 job  `prompt` dan `multi_prompt` dikirim bersamaan (fal menolak keduanya)
--   1 job  selesai tanpa URL media, penyebab yang sama
--
-- Semuanya permintaan yang kita susun sendiri dengan bentuk yang salah, dan
-- semuanya sudah diperbaiki di `submit_multishot`. Job Kling v3 yang bentuk
-- permintaannya benar: 1 dikirim, 1 jadi. Rapor yang menjumlahkan kegagalan
-- tanpa memisahkan sebabnya akan menghukum Kling v3 selamanya untuk bug yang
-- sudah tidak ada — jadi sebabnya dipisah, dan `fair_attempts` hanya
-- menghitung percobaan yang benar-benar sampai ke model dalam bentuk yang sah.
--
-- EMPAT SEBAB, KARENA EMPAT ORANG BERBEDA YANG HARUS BERTINDAK
--
--   input    bentuk permintaan kita salah      -> yang memperbaiki: kita, di kode
--   policy   provider menolak isi/foto/prompt  -> yang memperbaiki: pemakainya
--   config   kunci/katalog belum benar         -> yang memperbaiki: operator
--   provider model/provider yang gagal         -> ini saja yang menilai model
--
-- Dari 22 job gagal pertama: 10 `input` ($11,19), 6 `policy` ($2,65), 6
-- `config` ($0,74), dan NOL `provider`. Artinya sampai hari ini belum ada satu
-- pun bukti bahwa ada model di katalog ini yang gagal karena dirinya sendiri.

create or replace function public.job_failure_kind(err text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when err is null or btrim(err) = '' then null
    -- Kunci belum dipasang / ditolak, atau endpoint tidak ada karena provider
    -- di katalog tidak cocok dengan tempat job dikirim (job qwen-image-3.0-pro
    -- 8 Sep menjawab "fal.ai error 404": model DashScope dikirim ke fal).
    when err ~* '(key belum dipasang|invalid key credentials|key dashscope belum ada|belum punya pemetaan|error 40[134])' then 'config'
    -- Ditolak provider karena ISINYA, bukan bentuknya. Tidak ada pemeriksaan
    -- di sisi kita yang bisa menebak ini lebih dulu.
    when err ~* '(content_policy_violation|inappropriate content|flagged by a content checker)' then 'policy'
    -- Bentuk permintaan salah: field kurang, nilai di luar batas, dua field
    -- saling eksklusif dikirim bersamaan, URL yang tidak bisa diunduh. Semua
    -- ini bisa dicegah GRATIS sebelum job berangkat.
    when err ~* '(422|size must be between|cannot both be provided|melebihi 512|file_download_error|field required|"type":"missing"|input_value_error|value_error|please check url|tanpa url media)' then 'input'
    else 'provider'
  end
$$;

comment on function public.job_failure_kind(text) is
  'Menggolongkan production_jobs.error jadi input|policy|config|provider — '
  'menentukan siapa yang harus bertindak, dan sebab mana yang boleh dipakai '
  'untuk menilai modelnya (hanya "provider").';

-- Rapor dihitung dari SEMUA workspace, bukan per workspace.
--
-- Disengaja, dan ini pertukaran yang perlu disadari. Yang dibagi ke semua
-- pemakai hanya angka agregat per model: berapa kali dicoba, berapa jadi,
-- berapa biayanya. Tidak ada workspace, pemakai, prompt, atau hasil yang ikut
-- keluar. Sebagai gantinya, pelanggan pertama yang membuka dropdown langsung
-- melihat rekaman 156 job — bukan layar kosong yang baru berguna setelah dia
-- sendiri membakar uang untuk mengumpulkannya.
--
-- Kalau suatu hari rekaman itu tidak boleh lagi dibagi, satu baris yang
-- diubah: `alter view public.model_scorecard set (security_invoker = on)`,
-- dan tiap workspace kembali hanya melihat rekamannya sendiri lewat RLS
-- `production_jobs`.
create or replace view public.model_scorecard as
with j as (
  select
    model_key,
    task,
    status,
    created_at,
    coalesce(cost_estimate_usd, 0)::numeric as est,
    case when status = 'failed' then public.job_failure_kind(error) end as kind
  from public.production_jobs
  where status in ('succeeded', 'failed')
)
select
  model_key,
  task,
  count(*)::int                                     as attempts,
  count(*) filter (where status = 'succeeded')::int as succeeded,
  count(*) filter (where kind = 'input')::int       as failed_input,
  count(*) filter (where kind = 'policy')::int      as failed_policy,
  count(*) filter (where kind = 'config')::int      as failed_config,
  count(*) filter (where kind = 'provider')::int    as failed_provider,
  -- Percobaan yang bentuk permintaannya sah, kuncinya ada, dan isinya lolos
  -- saringan provider — satu-satunya himpunan yang mengatakan sesuatu tentang
  -- modelnya sendiri.
  (count(*) filter (where status = 'succeeded' or kind = 'provider'))::int as fair_attempts,
  round(sum(est), 4)                                              as spent_usd,
  round(coalesce(sum(est) filter (where status = 'failed'), 0), 4) as wasted_usd,
  -- INI yang dipakai untuk mengurutkan: seluruh biaya yang pernah keluar untuk
  -- model ini dibagi jumlah hasil yang benar-benar ada. Percobaan yang gagal
  -- ikut dihitung, karena percobaan yang gagal juga dibayar.
  round(sum(est) / nullif(count(*) filter (where status = 'succeeded'), 0), 4) as usd_per_result,
  -- Versi yang mengabaikan kegagalan yang bukan salah modelnya. Menjawab
  -- "kalau bug bentuk permintaannya sudah dibetulkan, model ini sebenarnya
  -- berapa?" — untuk Kling v3: $10,64 turun jadi $1,34.
  round(
    coalesce(sum(est) filter (where status = 'succeeded' or kind = 'provider'), 0)
    / nullif(count(*) filter (where status = 'succeeded'), 0), 4
  ) as usd_per_result_fair,
  round(
    count(*) filter (where status = 'succeeded')::numeric * 100
    / nullif(count(*) filter (where status = 'succeeded' or kind = 'provider'), 0), 1
  ) as success_pct,
  -- Berapa kali tombol harus ditekan untuk mendapat SATU hasil.
  --
  -- Ini yang dipakai UI, bukan `usd_per_result`. Alasannya: model per_second
  -- ditagih per detik, jadi $0,20 per hasil milik Wan (klip 5 detik) dan $1,97
  -- milik Kling Avatar (audio 34 detik) bukan angka sejenis — yang satu murah,
  -- yang lain cuma lebih pendek. Pengalinya bebas satuan: berapa pun estimasi
  -- yang sudah dihitung layar untuk durasi yang DIA pilih, kalikan dengan ini
  -- dan itulah biaya sebenarnya sampai jadi.
  round(count(*)::numeric / nullif(count(*) filter (where status = 'succeeded'), 0), 2) as tries_per_result,
  round(
    (count(*) filter (where status = 'succeeded' or kind = 'provider'))::numeric
    / nullif(count(*) filter (where status = 'succeeded'), 0), 2
  ) as tries_per_result_fair,
  max(created_at) filter (where status = 'succeeded') as last_success_at
from j
group by model_key, task;

comment on view public.model_scorecard is
  'Rekaman nyata tiap model dari production_jobs: berapa kali dicoba, berapa '
  'jadi, sebab kegagalan digolongkan, dan biaya per HASIL JADI. Agregat '
  'lintas workspace — tanpa identitas, prompt, atau hasil siapa pun.';

-- Katalog + rapornya dalam satu baris, supaya pemanggil yang sudah ada tinggal
-- mengganti nama tabel dan tidak perlu menyusun join sendiri.
--
-- Kolom katalog disebut satu per satu, BUKAN `pm.*`. Dengan `*`, kolom baru di
-- provider_models otomatis ikut bocor lewat view ini — termasuk kolom yang
-- suatu hari memang tidak untuk dibaca browser. Menyebutkannya membuat setiap
-- penambahan jadi keputusan sadar.
create or replace view public.provider_models_ranked as
select
  pm.id, pm.model_key, pm.label, pm.task, pm.provider, pm.quality_tier,
  pm.est_price_usd, pm.unit, pm.active, pm.description,
  pm.keeps_identity, pm.accepts_init_image, pm.requires_key,
  pm.init_image_field, pm.voice_field, pm.ref_image_field, pm.ref_image_multi,
  pm.duration_field, pm.duration_values, pm.extra_input,
  pm.multishot_field, pm.audio_field, pm.prompt_field, pm.created_at,
  coalesce(s.attempts, 0)        as attempts,
  coalesce(s.succeeded, 0)       as succeeded,
  coalesce(s.fair_attempts, 0)   as fair_attempts,
  coalesce(s.failed_input, 0)    as failed_input,
  coalesce(s.failed_policy, 0)   as failed_policy,
  coalesce(s.failed_config, 0)   as failed_config,
  coalesce(s.failed_provider, 0) as failed_provider,
  s.spent_usd,
  s.wasted_usd,
  s.usd_per_result,
  s.usd_per_result_fair,
  s.success_pct,
  s.tries_per_result,
  s.tries_per_result_fair,
  s.last_success_at
from public.provider_models pm
left join public.model_scorecard s
  on s.model_key = pm.model_key and s.task = pm.task;

comment on view public.provider_models_ranked is
  'provider_models + model_scorecard. Dibaca pemilih model di SPA dan '
  'list_models di MCP. Menulis harga tetap lewat tabel provider_models.';

-- `authenticated` saja, TIDAK `anon`.
--
-- Ini beda penting dari `provider_models`, yang boleh dibaca siapa pun. Kedua
-- view ini membaca `production_jobs`, dan karena view di Postgres berjalan
-- sebagai pemiliknya, RLS `is_member(workspace_id)` di tabel itu TIDAK ikut
-- berlaku di sini. Buat pemakai yang sudah masuk itu memang yang diinginkan
-- (rekaman dikumpulkan lintas workspace supaya berguna sejak job pertama);
-- buat pengunjung anonim tidak ada alasannya sama sekali.
grant select on public.model_scorecard to authenticated;
grant select on public.provider_models_ranked to authenticated;

-- Rapor memindai production_jobs per model_key; 156 baris hari ini, tapi
-- indeksnya dipasang sekarang supaya tidak perlu diingat lagi nanti.
create index if not exists production_jobs_model_status_idx
  on public.production_jobs (model_key, status);
