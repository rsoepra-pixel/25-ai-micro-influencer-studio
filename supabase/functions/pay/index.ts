// Edge function `pay` — penerima HTTP Notification dari DOKU.
//
// Fungsi ini adalah SATU-SATUNYA pintu di mana pihak luar bisa memberi akses
// berbayar ke aplikasi ini. Karena itu urutan kerjanya dibalik dari kebiasaan:
// catat dulu, verifikasi, baru bertindak — dan tidak ada satu pun cabang yang
// bertindak sebelum tanda tangannya terbukti.
//
// TANDA TANGAN DOKU (dari dokumentasi resmi, "Generate and Validate Signature")
//
// Doku mengirim header: Client-Id, Request-Id, Request-Timestamp, Signature.
// Komponen yang ditandatangani disusun satu baris per komponen, dipisah "\n",
// TANPA "\n" di akhir:
//
//   Client-Id:<nilai header>
//   Request-Id:<nilai header>
//   Request-Timestamp:<nilai header>
//   Request-Target:<path Notification URL yang didaftarkan di Back Office>
//   Digest:<base64(sha256(body mentah))>
//
// Signature = "HMACSHA256=" + base64(HMAC-SHA256(Secret Key, komponen di atas)).
//
// DUA JEBAKAN YANG MEMBUAT VERIFIKASI GAGAL PADAHAL KUNCINYA BENAR
//
// 1. Digest dihitung dari BODY MENTAH, bukan dari hasil JSON.parse yang
//    di-stringify ulang. Satu spasi yang berbeda mengubah hash-nya. Karena itu
//    body dibaca sebagai teks lebih dulu, dan parse dilakukan dari teks itu.
// 2. Request-Target adalah path Notification URL yang DIDAFTARKAN di Doku,
//    bukan tebakan. Kalau di Back Office tertulis .../functions/v1/pay maka
//    itulah nilainya, lengkap dengan prefiksnya. Disimpan di service_config
//    supaya bisa dibetulkan tanpa deploy ulang.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function sha256Base64(text: string): Promise<string> {
  return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function hmacBase64(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

// Perbandingan waktu-tetap. Tanda tangan yang dibandingkan dengan === bocor
// lewat waktu: penyerang bisa menebaknya karakter demi karakter.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function config(key: string): Promise<string> {
  const { data } = await admin.from("service_config").select("value").eq("key", key).maybeSingle();
  return (data?.value || "").trim();
}

// Ambil nilai pertama yang ada dari beberapa jalur bertitik.
//
// Bentuk payload Doku berbeda antar produk (Virtual Account, e-wallet, kartu),
// dan mengunci diri ke satu jalur berarti satu jenis pembayaran diam-diam
// berhenti bekerja. Jadi dicoba beberapa jalur yang dikenal, dan payload
// mentahnya tetap disimpan supaya jalur yang belum terdaftar bisa ditambahkan
// setelah terlihat sekali.
function pick(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const seg of path.split(".")) {
      if (cur && typeof cur === "object") {
        cur = (cur as Record<string, unknown>)[seg];
      } else { cur = undefined; break; }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

// Status yang berarti "uangnya benar-benar masuk". Doku memakai istilah yang
// berbeda per produk; yang TIDAK ada di daftar ini tidak pernah memberi akses.
// Daftar putih, bukan daftar hitam: status baru yang belum dikenal harus
// berakhir sebagai "diabaikan", bukan sebagai "lunas".
const PAID = new Set(["SUCCESS", "SETTLEMENT", "PAID", "CAPTURE", "COMPLETED"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Body dibaca sebagai TEKS, sekali. Digest harus dihitung dari byte yang
  // benar-benar dikirim Doku.
  const rawBody = await req.text();
  const h = req.headers;
  const clientId = h.get("Client-Id") || "";
  const requestId = h.get("Request-Id") || "";
  const timestamp = h.get("Request-Timestamp") || "";
  const signature = h.get("Signature") || "";

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(rawBody); } catch { /* dicatat apa adanya di bawah */ }

  // Dihitung SEKALI. Dulu nilainya dibuat ulang di dalam record(), jadi dua
  // pemanggilan dalam satu request yang tidak punya Request-Id akan memakai
  // dua event_id yang berbeda — dan idempotensi yang kuncinya berubah-ubah
  // bukan idempotensi.
  const eventId = requestId || `no-request-id-${crypto.randomUUID()}`;
  const rawForLog = Object.keys(payload).length ? payload : { unparsed: rawBody.slice(0, 4000) };

  // Baris tempat hasil pemrosesan ini akan tinggal. Diklaim setelah tanda
  // tangannya terbukti, sebelum ada satu pun tindakan yang dijalankan.
  let eventRowId: string | null = null;

  // Pencatatan untuk cabang-cabang SEBELUM verifikasi selesai (secret belum
  // dipasang, tanda tangan salah). Cabang-cabang itu tidak pernah bertindak,
  // jadi mereka cukup meninggalkan jejak.
  async function record(fields: Record<string, unknown>) {
    const { error } = await admin.from("payment_events").insert({
      provider: "doku", event_id: eventId, raw: rawForLog, ...fields,
    });
    if (error && !String(error.message).includes("duplicate key")) {
      console.error("gagal mencatat payment_event:", error.message);
    }
    return !!error;
  }

  // Hasil akhir ditulis ke baris yang SUDAH diklaim, bukan disisipkan baris
  // baru — kalau disisipkan, ia bentrok dengan klaimnya sendiri.
  async function finish(fields: Record<string, unknown>) {
    if (!eventRowId) return record(fields);
    const { error } = await admin.from("payment_events").update(fields).eq("id", eventRowId);
    if (error) console.error("gagal memperbarui payment_event:", error.message);
    return !!error;
  }

  try {
    const secret = await config("doku_secret_key");
    const expectClient = await config("doku_client_id");
    const target = (await config("doku_notification_path")) || new URL(req.url).pathname;

    if (!secret) {
      await record({ signature_ok: false, result: "error", detail: "doku_secret_key belum dipasang di service_config." });
      return json({ error: "not configured" }, 503);
    }

    const digest = await sha256Base64(rawBody);
    const component = [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${timestamp}`,
      `Request-Target:${target}`,
      `Digest:${digest}`,
    ].join("\n");
    const expected = "HMACSHA256=" + (await hmacBase64(secret, component));

    const clientOk = !expectClient || safeEqual(clientId, expectClient);
    if (!safeEqual(signature, expected) || !clientOk) {
      await record({
        signature_ok: false,
        result: "bad_signature",
        detail: !clientOk
          ? `Client-Id tidak cocok (diterima: ${clientId.slice(0, 40)}).`
          : `Tanda tangan tidak cocok. Request-Target yang dipakai: ${target}. Pastikan sama persis dengan Notification URL di Back Office Doku.`,
      });
      // 401, bukan 200: tanda tangan salah berarti pengirimnya belum terbukti
      // Doku, dan tidak ada gunanya berpura-pura menerima.
      return json({ error: "invalid signature" }, 401);
    }

    // ---- Mulai dari sini, pengirimnya sudah terbukti Doku ----

    // KLAIM DULU, BARU BERTINDAK.
    //
    // Versi pertama mengandalkan unique (provider, event_id) di pencatatan
    // AKHIR sebagai idempotensi. Itu keliru, dan kelirunya mahal: bentroknya
    // baru terjadi setelah activate_subscription selesai. Kiriman ulang — dan
    // payment gateway SELALU mengirim ulang — tetap memperpanjang langganan
    // sekali lagi, lalu baris catatannya dibuang karena bentrok. Satu
    // pembayaran jadi dua tahun, dan satu-satunya jejaknya justru yang hilang.
    // Ketahuan dari uji end-to-end: kiriman kedua memindahkan expires_at dari
    // 2027 ke 2028.
    //
    // Sekarang barisnya dibuat lebih dulu dengan result "processing". Yang
    // kalah di unique constraint adalah kiriman ulang, dan ia pulang tanpa
    // menyentuh apa pun.
    const { data: claimed, error: claimErr } = await admin.from("payment_events")
      .insert({ provider: "doku", event_id: eventId, signature_ok: true, raw: rawForLog, result: "processing" })
      .select("id").single();

    if (claimErr) {
      const { data: prev } = await admin.from("payment_events")
        .select("id, result").eq("provider", "doku").eq("event_id", eventId).maybeSingle();
      // Boleh diproses ulang HANYA kalau percobaan sebelumnya tidak sampai
      // memberi akses. Contoh nyata: harga paket belum diisi saat notifikasi
      // pertama datang (result "no_plan_match"); operator mengisinya, Doku
      // mengirim ulang, dan kiriman itu memang HARUS jadi. Yang tidak boleh
      // diulang cuma yang sudah aktif atau sedang diproses.
      if (!prev || prev.result === "activated" || prev.result === "processing") {
        return json({ ok: true, duplicate: true });
      }
      eventRowId = prev.id as string;
      await admin.from("payment_events").update({ result: "processing" }).eq("id", eventRowId);
    } else {
      eventRowId = claimed.id as string;
    }

    const status = String(pick(payload, ["transaction.status", "status", "order.status"]) || "").toUpperCase();
    const email = String(pick(payload, [
      "customer.email", "order.customer.email", "email", "customer_email",
    ]) || "").trim().toLowerCase();
    const amount = Number(pick(payload, [
      "order.amount", "transaction.amount", "order.gross_amount", "amount",
    ]) || 0);
    const invoice = String(pick(payload, [
      "order.invoice_number", "transaction.original_request_id", "order.session_id", "invoice_number",
    ]) || "");
    const sku = String(pick(payload, [
      "order.line_items.0.sku", "order.line_items.0.id", "service.id", "sku",
    ]) || "");

    if (!PAID.has(status)) {
      await finish({
        signature_ok: true, email, amount_idr: amount, external_ref: invoice,
        result: "ignored_status", detail: `Status "${status}" bukan pembayaran lunas — tidak ada akses yang diberikan.`,
      });
      return json({ ok: true, ignored: status });
    }
    if (!email) {
      await finish({
        signature_ok: true, amount_idr: amount, external_ref: invoice,
        result: "error", detail: "Payload tidak memuat email pembeli — akun tidak bisa dibuat. Lihat kolom raw untuk bentuk payload sebenarnya.",
      });
      return json({ ok: true, warning: "no email" });
    }

    // ---- Cocokkan ke paket: SKU dulu, baru nominal ----
    const { data: plans } = await admin.from("subscription_plans")
      .select("code, sku, price_idr").eq("active", true);
    const plan = (plans || []).find((p) => p.sku && sku && p.sku === sku)
      || (plans || []).find((p) => p.price_idr != null && Number(p.price_idr) === amount);

    if (!plan) {
      await finish({
        signature_ok: true, email, amount_idr: amount, external_ref: invoice,
        result: "no_plan_match",
        detail: `Tidak ada paket aktif dengan SKU "${sku}" atau harga ${amount}. Isi harga/SKU paket di halaman Pelanggan, lalu proses ulang event ini.`,
      });
      // 200: mengulang kiriman tidak akan menolong sampai operator mengisi
      // harga paketnya. Event-nya tersimpan lengkap dan bisa diproses ulang
      // dari halaman admin.
      return json({ ok: true, warning: "no plan match" });
    }

    // ---- Cari akun; buat kalau belum ada ----
    // Akun baru dibuat dengan password acak yang TIDAK disimpan di mana pun.
    // Pelanggan menerima aksesnya lewat link atur-password yang dibuat operator
    // dari halaman Pelanggan. Menyimpan password dalam bentuk terbaca — sekali
    // pun "cuma sementara" — adalah kebocoran yang menunggu waktu.
    const { data: existing } = await admin.rpc("user_id_by_email", { addr: email });
    let userId: string | null = existing || null;
    let created = false;
    if (!userId) {
      const pw = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((n) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"[n % 60]).join("");
      const { data: made, error: mkErr } = await admin.auth.admin.createUser({
        email, password: pw, email_confirm: true,
      });
      if (mkErr) {
        await finish({
          signature_ok: true, email, amount_idr: amount, external_ref: invoice,
          matched_plan: plan.code, result: "error", detail: `Gagal membuat akun: ${mkErr.message}`,
        });
        return json({ ok: true, warning: "create failed" });
      }
      userId = made.user!.id;
      created = true;
    }

    // Workspace-nya dibuat trigger handle_new_user saat user lahir.
    const { data: mem } = await admin.from("workspace_members")
      .select("workspace_id").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
    if (!mem) {
      await finish({
        signature_ok: true, email, amount_idr: amount, external_ref: invoice,
        matched_plan: plan.code, result: "error", detail: "Akun ada tapi tidak punya workspace.",
      });
      return json({ ok: true, warning: "no workspace" });
    }

    const { data: act, error: actErr } = await admin.rpc("activate_subscription", {
      ws: mem.workspace_id, plan: plan.code, src: "webhook", ref: invoice || null,
      memo: `Doku ${status} — ${amount}`, actor: null,
    });
    if (actErr) {
      await finish({
        signature_ok: true, email, amount_idr: amount, external_ref: invoice,
        matched_plan: plan.code, workspace_id: mem.workspace_id,
        result: "error", detail: `Aktivasi gagal: ${actErr.message}`,
      });
      return json({ ok: true, warning: "activate failed" });
    }

    const row = Array.isArray(act) ? act[0] : act;
    await finish({
      signature_ok: true, email, amount_idr: amount, external_ref: invoice,
      matched_plan: plan.code, workspace_id: mem.workspace_id, result: "activated",
      detail: `${created ? "Akun baru dibuat" : "Akun lama"}, aktif sampai ${row?.out_expires_at}` +
        (Number(row?.out_credit_granted) > 0 ? `, kredit +$${row.out_credit_granted}` : ""),
    });
    return json({ ok: true, activated: true, new_account: created });
  } catch (e) {
    // `signature_ok` hanya ditulis kalau barisnya belum ada. Kalau sudah
    // diklaim, tanda tangannya SUDAH terbukti benar dan menimpanya dengan
    // false akan menuduh Doku mengirim sesuatu yang tidak pernah ia kirim.
    await finish({
      ...(eventRowId ? {} : { signature_ok: false }),
      result: "error", detail: String((e as Error).message || e).slice(0, 500),
    });
    return json({ error: "internal" }, 500);
  }
});
