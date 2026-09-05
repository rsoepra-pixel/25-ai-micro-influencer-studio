// Edge function `r` — pengalih link pendek, sekaligus pencatat kliknya.
//
// GET .../r/:code  → 302 ke target, satu baris masuk ke link_clicks.
//
// Deploy dengan verify_jwt=false: yang mengklik link ini orang asing di
// Instagram, bukan user yang login. Tidak ada satu pun data workspace yang
// dikembalikan dari sini — hanya Location header — jadi tidak ada yang bocor
// dengan membukanya tanpa auth.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const APP_URL = "https://25-ai-microinfluencer.netlify.app/";

// Crawler pratinjau. Setiap link yang ditempel di WhatsApp, Telegram, Slack,
// atau DM Instagram diambil duluan oleh bot mereka untuk membuat kartu
// pratinjau — sering beberapa kali. Kalau ini dihitung sebagai klik, satu
// tempel bisa terlihat seperti tiga orang tertarik, dan angka yang dipakai
// memutuskan konten berikutnya jadi karangan.
//
// Daftarnya tidak akan pernah lengkap; yang penting yang paling sering muncul
// tertangkap, dan sisanya tetap tercatat sebagai manusia — bukan dibuang.
const BOT_RE =
  /bot|crawler|spider|preview|fetch|curl|wget|python-requests|headless|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|embedly|quora link preview|pinterest|redditbot|applebot|bingbot|googlebot|yandex|petalbot|semrush|ahrefs/i;

async function visitorHash(ip: string): Promise<string | null> {
  if (!ip) return null;
  const { data } = await admin.from("service_config").select("value").eq("key", "link_hash_salt").maybeSingle();
  const salt = data?.value;
  // Tanpa garam, lebih baik tidak menyimpan apa-apa daripada menyimpan hash IP
  // yang bisa dibalik dengan mencoba seluruh ruang IPv4.
  if (!salt) return null;
  // Tanggal ikut masuk hash: pencacah "pengunjung berbeda" jadi per hari, dan
  // jejaknya otomatis putus tiap ganti hari tanpa perlu job pembersih.
  const day = new Date().toISOString().slice(0, 10);
  const buf = new TextEncoder().encode(`${ip}|${salt}|${day}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // .../functions/v1/r/ABC123 → "ABC123". Segmen terakhir yang tidak kosong,
  // supaya jalan baik lewat Netlify proxy maupun langsung ke supabase.co.
  const parts = url.pathname.split("/").filter(Boolean);
  const code = parts[parts.length - 1] || "";

  if (!code || code === "r") return Response.redirect(APP_URL, 302);

  const { data: link } = await admin
    .from("short_links")
    .select("id, target_url, active")
    .eq("code", code)
    .maybeSingle();

  // Link mati atau salah ketik tidak menampilkan halaman error milik kita —
  // pengunjung datang dari Instagram dan tidak punya urusan dengan app ini.
  // Dipulangkan ke beranda, dan tidak dicatat sebagai klik.
  if (!link || !link.active) return Response.redirect(APP_URL, 302);

  const ua = req.headers.get("user-agent") || "";
  const isBot = BOT_RE.test(ua);

  // Pencatatan tidak boleh menahan pengalihan. Kalau insert gagal, yang hilang
  // satu baris data; kalau pengalihannya yang tertahan, yang hilang orangnya.
  try {
    await admin.from("link_clicks").insert({
      short_link_id: link.id,
      visitor_hash: isBot ? null : await visitorHash(clientIp(req)),
      referer: (req.headers.get("referer") || "").slice(0, 500) || null,
      ua: ua.slice(0, 500) || null,
      is_bot: isBot,
    });
  } catch (_) { /* diamkan: pengunjung lebih penting daripada barisnya */ }

  // 302, BUKAN 301. Browser menyimpan 301 secara permanen — klik kedua dari
  // orang yang sama tidak akan pernah sampai ke server lagi, dan angkanya
  // berhenti bertambah tanpa ada yang sadar. Cache-Control menutup celah yang
  // sama di proxy di tengah jalan.
  return new Response(null, {
    status: 302,
    headers: {
      location: link.target_url,
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
});
