-- Kunci internal kedua, kewenangannya BERBEDA dari kunci cron.
--
-- internal_cron_key  → hanya boleh `poll`
-- internal_mcp_key   → boleh `poll` + `submit` (generate) dan `publish` (social)
--
-- Dipisah karena taruhannya tidak sama. Kunci cron tertulis di perintah cron
-- yang bisa dibaca siapa pun dengan akses DB; ia tidak boleh bisa mengantre job
-- berbayar. Kunci MCP dipakai fungsi `mcp`, yang sudah lebih dulu
-- mengautentikasi pemanggilnya per workspace lewat token OAuth/statik — jadi
-- kewenangan belanja di situ memang sudah diberikan di lapisan atasnya.
--
-- Daftar kewenangannya ditegakkan di kode (INTERNAL_KEYS di generate/index.ts),
-- bukan di komentar ini.
insert into public.service_config (key, value)
values ('internal_mcp_key', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
