// Edge function `generate` — job produksi AI (mock & live via fal.ai).
// Actions: status | set_key | set_mode | submit | poll
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesi tidak valid — silakan login ulang.");
  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id, role").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!mem) throw new Error("Kamu belum tergabung di workspace.");
  return { user: data.user, ws: mem.workspace_id as string };
}
async function getSecret(ws: string, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("workspace_id", ws).eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSecret(ws: string, key: string, value: string | null) {
  const { error } = await admin.from("app_secrets")
    .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Cari URL media pertama di respons fal.ai (bentuknya beda-beda per model).
function findMediaUrl(o: unknown): string | null {
  const seen = new Set<object>();
  const stack: unknown[] = [o];
  let fallback: string | null = null;
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur as object)) continue;
    seen.add(cur as object);
    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) {
        if (/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i.test(v)) return v;
        if (!fallback) fallback = v;
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return fallback;
}

const MOCK_OUTPUTS: Record<string, (seed: string) => string> = {
  image: (s) => `https://picsum.photos/seed/${s}/768/1024`,
  video: () => "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  tts: () => "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  lipsync: () => "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
};
const assetKind = (task: string) => (task === "image" ? "image" : task === "tts" ? "audio" : "video");

async function monthSpent(ws: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await admin.from("credits_ledger").select("delta_usd")
    .eq("workspace_id", ws).eq("kind", "usage").gte("created_at", start.toISOString());
  return (data || []).reduce((s: number, r: { delta_usd: unknown }) => s + Math.abs(Number(r.delta_usd)), 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const { ws } = await requireUser(req);
    const mode = (await getSecret(ws, "generation_mode")) || "mock";

    switch (body.action) {
      case "status": {
        return json({ fal_key: !!(await getSecret(ws, "fal_key")), mode });
      }
      case "set_key": {
        const key = String(body.key || "").trim();
        if (key.length < 10) throw new Error("FAL key tidak valid.");
        await setSecret(ws, "fal_key", key);
        return json({ ok: true });
      }
      case "set_mode": {
        const m = body.mode === "live" ? "live" : "mock";
        if (m === "live" && !(await getSecret(ws, "fal_key"))) throw new Error("Pasang FAL key dulu sebelum mode live.");
        await setSecret(ws, "generation_mode", m);
        return json({ ok: true, mode: m });
      }
      case "submit": {
        const { task, model_id, influencer_id, prompt = "", text = "", source_image_url, audio_url } = body;
        const duration = Number(body.duration || 5);
        const { data: model } = await admin.from("provider_models").select("*")
          .eq("id", model_id).eq("active", true).maybeSingle();
        if (!model) throw new Error("Model tidak ditemukan / tidak aktif.");

        let est = Number(model.est_price_usd);
        if (model.unit === "per_second") est *= duration;
        if (model.unit === "per_1k_chars") est = (est * (String(text).length || 500)) / 1000;

        let identity = "";
        if (influencer_id) {
          const { data: inf } = await admin.from("influencers")
            .select("identity_prompt, workspace_id").eq("id", influencer_id).maybeSingle();
          if (inf?.workspace_id === ws) identity = inf.identity_prompt || "";
        }
        const finalPrompt = [identity, prompt].filter(Boolean).join(", ");

        const falKey = await getSecret(ws, "fal_key");
        if (mode === "live") {
          if (!falKey) throw new Error("FAL key belum dipasang.");
          const { data: bud } = await admin.from("budget_settings").select("*").eq("workspace_id", ws).maybeSingle();
          const cap = Number(bud?.monthly_cap_usd ?? 200);
          if ((bud?.hard_stop ?? true)) {
            const spent = await monthSpent(ws);
            if (spent + est > cap) {
              throw new Error(`Budget guard: estimasi $${est.toFixed(2)} akan melewati batas bulanan $${cap.toFixed(2)} (terpakai $${spent.toFixed(2)}).`);
            }
          }
        }

        const { data: job, error: jobErr } = await admin.from("production_jobs").insert({
          workspace_id: ws, influencer_id: influencer_id || null, task,
          model_key: model.model_key, prompt: finalPrompt || String(text).slice(0, 500) || null,
          status: "queued", cost_estimate_usd: est,
        }).select("*").single();
        if (jobErr) throw new Error(jobErr.message);

        if (mode === "mock") {
          const url = (MOCK_OUTPUTS[task] || MOCK_OUTPUTS.image)(job.id.slice(0, 8));
          await admin.from("production_jobs").update({ status: "succeeded", output_url: url, cost_actual_usd: 0 }).eq("id", job.id);
          await admin.from("assets").insert({
            workspace_id: ws, influencer_id: influencer_id || null,
            kind: assetKind(task), url, name: `${task}-${job.id.slice(0, 8)} (mock)`,
          });
          return json({ ok: true, job_id: job.id, status: "succeeded", mode });
        }

        // live — submit ke fal.ai queue
        const input: Record<string, unknown> = {};
        if (task === "image") { input.prompt = finalPrompt; input.image_size = "portrait_4_3"; input.num_images = 1; }
        else if (task === "video") {
          input.prompt = finalPrompt; input.duration = String(duration <= 5 ? 5 : 10);
          if (source_image_url) input.image_url = source_image_url;
        } else if (task === "tts") { input.text = String(text); }
        else if (task === "lipsync") {
          if (String(model.model_key).includes("sadtalker")) {
            input.source_image_url = source_image_url; input.driven_audio_url = audio_url;
          } else { input.video_url = source_image_url; input.audio_url = audio_url; }
        }

        const res = await fetch(`https://queue.fal.run/${model.model_key}`, {
          method: "POST",
          headers: { Authorization: `Key ${falKey}`, "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const qr = await res.json().catch(() => ({}));
        if (!res.ok || !qr.request_id) {
          const errMsg = (qr?.detail ? JSON.stringify(qr.detail) : `fal.ai error ${res.status}`).slice(0, 500);
          await admin.from("production_jobs").update({ status: "failed", error: errMsg }).eq("id", job.id);
          throw new Error(`Gagal submit ke fal.ai: ${errMsg}`);
        }
        await admin.from("production_jobs").update({ status: "running", external_id: qr.request_id }).eq("id", job.id);
        return json({ ok: true, job_id: job.id, status: "running", mode });
      }
      case "poll": {
        const { data: running } = await admin.from("production_jobs").select("*")
          .eq("workspace_id", ws).eq("status", "running").not("external_id", "is", null).limit(10);
        const falKey = await getSecret(ws, "fal_key");
        let updated = 0;
        for (const jb of running || []) {
          if (!falKey) break;
          try {
            const base = `https://queue.fal.run/${jb.model_key}/requests/${jb.external_id}`;
            const sres = await fetch(`${base}/status`, { headers: { Authorization: `Key ${falKey}` } });
            const st = await sres.json().catch(() => ({}));
            if (st.status === "COMPLETED") {
              const rres = await fetch(base, { headers: { Authorization: `Key ${falKey}` } });
              const result = await rres.json().catch(() => ({}));
              const url = findMediaUrl(result);
              const cost = Number(jb.cost_estimate_usd) || 0;
              await admin.from("production_jobs").update({ status: "succeeded", output_url: url, cost_actual_usd: cost }).eq("id", jb.id);
              if (url) {
                await admin.from("assets").insert({
                  workspace_id: ws, influencer_id: jb.influencer_id,
                  kind: assetKind(jb.task), url, name: `${jb.task}-${jb.id.slice(0, 8)}`,
                });
              }
              if (cost > 0) {
                await admin.from("credits_ledger").insert({ workspace_id: ws, kind: "usage", delta_usd: -cost, note: `job ${jb.id}` });
              }
              updated++;
            } else if (st.status === "ERROR" || sres.status >= 400) {
              await admin.from("production_jobs").update({
                status: "failed",
                error: (st.error || st.detail ? JSON.stringify(st.error || st.detail) : `fal status ${sres.status}`).slice(0, 500),
              }).eq("id", jb.id);
              updated++;
            }
          } catch (_e) { /* job berikutnya; dicoba lagi di poll berikut */ }
        }
        return json({ updated });
      }
      default:
        throw new Error(`Action tidak dikenal: ${body.action}`);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
