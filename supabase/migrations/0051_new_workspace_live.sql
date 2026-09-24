-- Workspace baru lahir dalam mode `live`.
--
-- APA YANG TERJADI PADA PELANGGAN PERTAMA
--
-- `handle_new_user()` membuat workspace, keanggotaan owner, dan baris
-- langganan — tapi tidak pernah menulis `generation_mode`. Dan pembaca di
-- `generate` berbunyi:
--
--     const mode = (await getSecret(ws, "generation_mode")) || "mock";
--
-- Jadi setiap workspace baru diam-diam berada di mode MOCK. Pelanggan yang
-- sudah membayar, sudah diisi saldonya, dan akhirnya berhasil masuk akan
-- menekan Generate dan menerima gambar contoh dari picsum.photos serta video
-- sampel Google. Tidak ada error. Tidak ada tanda. Yang ia simpulkan: platform
-- ini tidak bekerja.
--
-- Dan ia tidak bisa membetulkannya sendiri: sejak migrasi 0042 memusatkan API,
-- tombol mode live/mock hanya muncul untuk operator platform. Jadi satu-satunya
-- jalan keluar adalah operator turun tangan lewat SQL untuk tiap pelanggan —
-- persis yang baru saja terjadi, dan persis yang akan terulang di pelanggan
-- kedua, ketiga, dan seterusnya.
--
-- KENAPA `live`, BUKAN `mock`, UNTUK PENDAFTAR YANG BELUM BAYAR
--
-- Mode live TIDAK berarti tagihan langsung jalan. Gerbang di production_jobs
-- tetap menolak model berbayar tanpa langganan aktif, dan saldo nol tetap
-- menghentikan semuanya. Yang didapat pendaftar baru adalah model gratis
-- (Hugging Face) yang bekerja SUNGGUHAN — hasil yang benar-benar miliknya,
-- bukan gambar contoh yang menipu.
--
-- Mock justru yang berbahaya sebagai default: ia tidak pernah gagal, jadi ia
-- tidak pernah memberi tahu bahwa ada yang salah.
--
-- Mode mock tetap milik operator saja — dijaga trigger app_secrets_central_api
-- dari 0042, yang menolak pelanggan menyimpan 'mock'. Migrasi ini tidak
-- melonggarkannya.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
declare ws_id uuid; label text;
begin
  if exists (select 1 from public.workspace_members where user_id = new.id) then
    return new;
  end if;
  label := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Workspace');
  insert into public.workspaces (name, billing_mode, credit_since)
  values ('Workspace ' || label, 'credit', now())
  returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  insert into public.subscriptions (workspace_id, status) values (ws_id, 'unpaid')
    on conflict (workspace_id) do nothing;

  -- Satu-satunya tambahan dari 0042: modenya disebut, tidak dibiarkan
  -- dibaca sebagai mock oleh nilai bawaan pembacanya.
  insert into public.app_secrets (workspace_id, key, value, updated_at)
  values (ws_id, 'generation_mode', 'live', now())
  on conflict (workspace_id, key) do nothing;

  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- Workspace yang sudah terlanjur lahir tanpa modenya
--
-- Hanya yang BELUM punya barisnya yang disentuh: operator mungkin sengaja
-- menaruh workspace tertentu di mock, dan migrasi tidak berhak membatalkan
-- keputusan itu.
insert into public.app_secrets (workspace_id, key, value, updated_at)
select w.id, 'generation_mode', 'live', now()
from public.workspaces w
where not exists (
  select 1 from public.app_secrets a
  where a.workspace_id = w.id and a.key = 'generation_mode'
)
on conflict (workspace_id, key) do nothing;
