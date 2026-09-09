// Product Kit — produk sebagai objek kelas satu, berdampingan dengan Identity Kit.
//
// KENAPA HALAMAN SENDIRI, BUKAN KOLOM DI WIZARD
//
// Satu produk dipakai di banyak video. Kalau fotonya diunggah di dalam wizard,
// video kedua mengunggah foto yang sama lagi, dan video ketiga memakai foto
// yang sedikit berbeda — lalu kemasannya "berubah" antar video tanpa ada yang
// tahu kenapa. Foto produk disimpan sekali di sini, wizard tinggal memilih.
//
// Foto yang dipakai HARUS foto asli. Model gambar mengarang label dan bentuk
// kemasan kalau cuma diberi teks; foto asli sebagai referensi adalah
// satu-satunya cara kemasannya tetap sama — dan itu pun tidak 100%, jadi
// wizard menampilkan gambar kuncinya untuk ditinjau sebelum video dibayar.
import React, { useEffect, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, downscaleToDataUri } from "./views.jsx";

// Produk + fotonya dalam satu bentuk yang enak dipakai UI dan wizard.
export function useProducts(ws, tick) {
  return useQuery(async () => {
    const products = unwrap(await supa.from("products").select("*").order("created_at", { ascending: false }));
    if (!products.length) return [];
    const photos = unwrap(await supa.from("product_photos").select("*")
      .in("product_id", products.map((p) => p.id)).order("position"));
    return products.map((p) => ({ ...p, photos: photos.filter((ph) => ph.product_id === p.id) }));
  }, [ws.id, tick]);
}

const linesToList = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
const listToLines = (arr) => (Array.isArray(arr) ? arr : []).join("\n");

export function Products({ ws, refresh, tick }) {
  const [localTick, setLocalTick] = useState(0);
  const [products, reload, error] = useProducts(ws, `${tick}:${localTick}`);
  const bump = () => setLocalTick((t) => t + 1);

  return (
    <div>
      <h1 className="mb1">📦 Product Kit</h1>
      <p className="muted mb4">
        Foto produk asli, disimpan sekali dan dipakai di banyak video UGC. Foto ini dikirim ke model gambar
        sebagai referensi — sama seperti foto wajah di Identity Kit — supaya kemasannya tidak dikarang.
      </p>

      <NewProduct ws={ws} onCreated={() => { bump(); refresh?.(); }} />

      <h2 className="mt6 mb2">Produk tersimpan</h2>
      {error && <div className="msg-err mb3">Gagal memuat produk: {String(error.message || error)}</div>}
      {!products?.length ? (
        <div className="card p6" style={{ textAlign: "center" }}>
          <div className="muted">Belum ada produk. Tambahkan satu di atas.</div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onChanged={() => { reload(); refresh?.(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// Foto → data URI yang sudah diperkecil. 1024 px cukup untuk referensi model
// gambar; foto 12 MP dari ponsel hanya memperlambat unggahan tanpa menambah
// apa pun ke hasilnya.
async function filesToDataUris(files) {
  const out = [];
  for (const f of Array.from(files || []).slice(0, 6)) {
    out.push(await downscaleToDataUri(f, 1024, 0.86));
  }
  return out;
}

function NewProduct({ ws, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("");
  const [avoid, setAvoid] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(null);

  async function save() {
    setErr(null); setBusy(true);
    try {
      if (!name.trim()) throw new Error("Nama produk wajib diisi.");
      setStep("Menyimpan produk…");
      const { data: p, error } = await supa.from("products").insert({
        workspace_id: ws.id,
        name: name.trim(),
        description: description.trim() || null,
        selling_points: linesToList(points),
        avoid_claims: avoid.trim() || null,
        link_url: link.trim() || null,
      }).select("id").single();
      if (error) throw new Error(error.message);

      if (files.length) {
        setStep(`Mengunggah ${files.length} foto…`);
        const photos = await filesToDataUris(files);
        const r = await callGenerate({ action: "product_photos", product_id: p.id, photos });
        if (r.photos_failed?.length) {
          setErr(`Produk tersimpan, tapi ${r.photos_failed.length} foto gagal: ` +
            r.photos_failed.map((f) => `foto ke-${f.index} (${f.reason})`).join(", "));
        }
      }
      setName(""); setDescription(""); setPoints(""); setAvoid(""); setLink(""); setFiles([]);
      onCreated?.(p.id);
    } catch (e) { setErr(e.message); }
    setBusy(false); setStep(null);
  }

  return (
    <div className="card p6">
      <div className="bold mb3">Tambah produk</div>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="label">Nama produk *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Serum Vitamin C Glowmate 30ml" />
        </div>
        <div>
          <label className="label">Tautan beli (opsional)</label>
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          <p className="tiny muted" style={{ marginTop: 4 }}>Dipakai untuk link pendek terlacak di caption.</p>
        </div>
      </div>
      <div className="mb3">
        <label className="label">Tentang produk (1–2 kalimat)</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Apa produknya, untuk siapa, dipakai kapan." />
      </div>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="label">Keunggulan — satu per baris</label>
          <textarea className="input" rows={4} value={points} onChange={(e) => setPoints(e.target.value)}
            placeholder={"bahannya lembut, tidak gatal\nmeresap cepat, tidak lengket\nharga di bawah 100 ribu"} />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Penulis naskah memilih 1–2 saja per video. Lima keunggulan dalam 10 detik terdengar seperti iklan radio.
          </p>
        </div>
        <div>
          <label className="label">Klaim yang DILARANG diucapkan</label>
          <textarea className="input" rows={4} value={avoid} onChange={(e) => setAvoid(e.target.value)}
            placeholder={"menyembuhkan, 100% aman, terbukti klinis, hasil dalam 3 hari"} />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Diteruskan ke penulis naskah sebagai larangan keras. Klaim medis/finansial spesifik selalu dilarang.
          </p>
        </div>
      </div>
      <div className="mb3">
        <label className="label">Foto produk asli (1–6 foto)</label>
        <input type="file" accept="image/*" multiple className="input"
          onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          Foto kemasan dari depan dengan label terbaca, lalu 1–2 sudut lain. Latar polos lebih baik. Diperkecil ke 1024 px di browser sebelum diunggah.
        </p>
      </div>
      {err && <div className="msg-err mb3">{err}</div>}
      <button className="btn" disabled={busy || !name.trim()} onClick={save}>{busy ? (step || "Menyimpan…") : "Simpan produk"}</button>
    </div>
  );
}

function ProductCard({ product, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm({
      name: product.name || "",
      description: product.description || "",
      points: listToLines(product.selling_points),
      avoid: product.avoid_claims || "",
      link: product.link_url || "",
    });
  }, [product]);

  async function saveEdit() {
    setErr(null); setBusy(true);
    try {
      const { error } = await supa.from("products").update({
        name: form.name.trim() || product.name,
        description: form.description.trim() || null,
        selling_points: linesToList(form.points),
        avoid_claims: form.avoid.trim() || null,
        link_url: form.link.trim() || null,
      }).eq("id", product.id);
      if (error) throw new Error(error.message);
      setEdit(false);
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function addPhotos(fileList) {
    setErr(null); setBusy(true);
    try {
      const photos = await filesToDataUris(fileList);
      if (!photos.length) return;
      const r = await callGenerate({ action: "product_photos", product_id: product.id, photos });
      if (r.photos_failed?.length) {
        setErr(`${r.photos_failed.length} foto gagal: ` + r.photos_failed.map((f) => `foto ke-${f.index} (${f.reason})`).join(", "));
      }
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // Menghapus baris fotonya saja. Filenya tetap ada di bucket sampai ada jalur
  // penghapusan bertanda service role seperti `media` untuk kind lain — foto
  // yatim di bucket tidak berbahaya, foto yang hilang dari produk yang masih
  // dipakai wizard jauh lebih mengganggu, jadi barisnya yang jadi kebenaran.
  async function removePhoto(id) {
    if (!window.confirm("Hapus foto ini dari Product Kit?")) return;
    setBusy(true);
    const { error } = await supa.from("product_photos").delete().eq("id", id);
    if (error) setErr(error.message);
    setBusy(false);
    onChanged?.();
  }

  async function removeProduct() {
    if (!window.confirm(`Hapus produk "${product.name}" beserta fotonya? Proyek UGC yang memakainya tetap ada tapi kehilangan produknya.`)) return;
    setBusy(true);
    const { error } = await supa.from("products").delete().eq("id", product.id);
    if (error) setErr(error.message);
    setBusy(false);
    onChanged?.();
  }

  const points = Array.isArray(product.selling_points) ? product.selling_points : [];

  return (
    <div className="card p4">
      {!edit ? (
        <>
          <div className="row mb1" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="bold">{product.name}</div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn2 tiny" onClick={() => setEdit(true)}>Ubah</button>
              <button className="btn btn2 tiny" disabled={busy} onClick={removeProduct}>Hapus</button>
            </div>
          </div>
          {product.description && <p className="small mb2">{product.description}</p>}
          {points.length > 0 && (
            <ul className="tiny mb2" style={{ paddingLeft: 18, margin: "0 0 8px" }}>
              {points.map((pt, i) => <li key={i}>{pt}</li>)}
            </ul>
          )}
          {product.avoid_claims && <div className="tiny muted mb2">🚫 {product.avoid_claims}</div>}
          {product.link_url && <div className="tiny mb2"><a href={product.link_url} target="_blank" rel="noreferrer">{product.link_url}</a></div>}
        </>
      ) : form && (
        <div className="mb3">
          <label className="label">Nama</label>
          <input className="input mb2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="label">Tentang produk</label>
          <textarea className="input mb2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="label">Keunggulan — satu per baris</label>
          <textarea className="input mb2" rows={4} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          <label className="label">Klaim yang dilarang</label>
          <textarea className="input mb2" rows={2} value={form.avoid} onChange={(e) => setForm({ ...form, avoid: e.target.value })} />
          <label className="label">Tautan beli</label>
          <input className="input mb2" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <div className="row">
            <button className="btn" disabled={busy} onClick={saveEdit}>Simpan</button>
            <button className="btn btn2" disabled={busy} onClick={() => setEdit(false)}>Batal</button>
          </div>
        </div>
      )}

      <div className="tiny bold muted mb1">Foto produk ({product.photos.length})</div>
      {product.photos.length ? (
        <div className="grid mb2" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {product.photos.map((ph) => (
            <div key={ph.id} style={{ position: "relative" }}>
              <div className="thumb" style={{ aspectRatio: "1" }}><img src={ph.url} alt="" /></div>
              <button type="button" className="btn btn2" disabled={busy} title="Hapus foto"
                style={{ position: "absolute", top: 4, right: 4, fontSize: 10, padding: "2px 6px" }}
                onClick={() => removePhoto(ph.id)}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="msg-warn mb2">Belum ada foto. Tanpa foto, wizard UGC tidak bisa menjaga kemasannya — produk akan dikarang model.</div>
      )}
      <label className="btn btn2 tiny" style={{ display: "inline-block", cursor: busy ? "default" : "pointer" }}>
        {busy ? "Memproses…" : "+ Tambah foto"}
        <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={busy}
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      </label>
      {err && <div className="msg-err mt2">{err}</div>}
    </div>
  );
}
