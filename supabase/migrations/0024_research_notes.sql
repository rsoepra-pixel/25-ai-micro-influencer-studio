-- Tempat menyimpan hasil riset relevansi.
--
-- KENAPA TIDAK MEMBANGUN SCRAPER TREN
--
-- Godaan pertamanya jelas: bikin cron yang mengambil hashtag trending dari
-- TikTok dan Instagram. Tiga alasan itu tidak dilakukan:
--
--   1. Melanggar ToS keduanya, dan yang dipertaruhkan akun sungguhan.
--   2. Rapuh. Halaman berubah, selektor patah, dan patahnya senyap — yang
--      terjadi bukan error, melainkan tabel tren yang berhenti diperbarui
--      sementara semua orang masih memercayainya.
--   3. Tren global bukan pertanyaannya. Yang menentukan bukan "apa yang ramai
--      di Indonesia minggu ini" melainkan "apa yang relevan untuk niche dan
--      audiens SPESIFIK akun ini" — dan itu penilaian, bukan hasil crawling.
--
-- Jadi pembagian kerjanya dibalik: CLAUDE yang meriset lewat web, app ini yang
-- mengingat. Tabel ini memorinya. Tanpa tempat menyimpan, setiap riset hilang
-- begitu percakapannya ditutup, dan bulan depan orang yang sama meriset ulang
-- hal yang sama tanpa tahu kesimpulan sebelumnya.

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  kind text not null default 'trend'
    check (kind in ('trend', 'audience', 'competitor', 'format', 'other')),

  title text not null,
  -- Apa yang ditemukan.
  summary text not null,
  -- Kenapa relevan SEKARANG. Dipisah dari summary dengan sengaja: bagian inilah
  -- yang basi duluan. Sebuah fakta bisa tetap benar setahun kemudian sementara
  -- alasan "kenapa sekarang"-nya sudah tidak berlaku sama sekali.
  why_now text,

  -- [{"url": "...", "note": "..."}]
  --
  -- Klaim tren tanpa sumber adalah tebakan yang berpakaian data. Model bahasa
  -- bisa menghasilkan kalimat yang sangat meyakinkan tentang tren yang tidak
  -- pernah ada, dan yang membedakannya dari temuan sungguhan cuma satu: ada
  -- atau tidak ada tautan yang bisa dibuka orang.
  sources jsonb not null default '[]'::jsonb,

  -- Dari mana keyakinannya berasal. Urutan kekuatannya menurun ke bawah, dan
  -- perbedaannya besar: apa yang ditulis penonton sendiri di kolom komentar
  -- jauh lebih kuat daripada artikel "10 tren TikTok 2026" yang ditulis untuk
  -- SEO. Tanpa kolom ini keduanya terlihat sama di daftar.
  evidence text not null default 'external_report'
    check (evidence in ('own_data', 'platform_signal', 'external_report', 'anecdote')),

  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),

  observed_at date not null default current_date,
  -- Kapan temuan ini berhenti bisa dipercaya.
  --
  -- Relevansi meluruh, dan riset lama yang disajikan seolah masih berlaku lebih
  -- berbahaya daripada tidak ada riset sama sekali — yang pertama membuat orang
  -- bertindak dengan yakin ke arah yang salah. Baris yang kedaluwarsa TIDAK
  -- dihapus: ia tetap dibutuhkan untuk menjawab "kita dulu bertindak atas dasar
  -- ini, hasilnya bagaimana?".
  expires_at date,

  influencer_id uuid references public.influencers(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists research_notes_ws_idx
  on public.research_notes (workspace_id, observed_at desc);

alter table public.research_notes enable row level security;

-- ---------------------------------------------------------------------------
-- Jejak dari temuan ke konten yang lahir darinya.
--
-- Ini yang membuat tabel di atas lebih dari sekadar buku catatan. Dengan kolom
-- ini, `post_metrics` bisa di-join balik sampai ke risetnya — dan pertanyaan
-- "apakah konten yang lahir dari riset benar-benar berkinerja lebih baik
-- daripada yang lahir dari tebakan" jadi bisa dijawab dengan angka.
--
-- Tanpa jejak ini, riset selamanya jadi kegiatan yang terasa produktif tanpa
-- pernah ada yang tahu apakah ia berguna.
alter table public.content_items
  add column if not exists research_note_id uuid references public.research_notes(id) on delete set null;

create index if not exists content_items_research_idx
  on public.content_items (research_note_id);
