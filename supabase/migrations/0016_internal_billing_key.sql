-- Kunci internal ketiga, dan yang paling sempit kewenangannya.
--
-- internal_cron_key     → poll (generate), autopublish (social)
-- internal_mcp_key      → poll + submit (generate), publish (social)
-- internal_billing_key  → grant_credit (app) — dan hanya itu
--
-- Kenapa tidak menumpang salah satu kunci yang sudah ada: kunci cron tertulis
-- di dalam perintah cron, dan kunci MCP dipakai server MCP yang melayani setiap
-- permintaan dari Claude. Keduanya beredar di jalur yang ramai. `grant_credit`
-- menambah saldo — ia mencetak sesuatu yang bisa dibelanjakan. Kunci yang bisa
-- melakukan itu berdiri sendiri, supaya kebocoran di jalur mana pun tidak
-- otomatis berarti saldo bisa dibuat sendiri.
--
-- Dan sengaja tidak ada jalur JWT ke `grant_credit`, bahkan untuk owner: owner
-- adalah pelanggan. Owner yang bisa menambah saldonya sendiri membuat seluruh
-- gerbang kredit ini jadi hiasan.
insert into public.service_config (key, value)
values ('internal_billing_key', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
