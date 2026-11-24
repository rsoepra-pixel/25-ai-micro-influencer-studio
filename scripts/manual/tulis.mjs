// Penulis AI palsu untuk mock: balasan aksi `write` dari fungsi `generate`,
// dalam bahasa Indonesia, dengan bentuk yang sama persis dengan yang dibaca UI
// (bentuknya dicocokkan ke supabase/functions/generate/index.ts).
//
// Isinya karangan yang terdengar wajar, bukan hasil model sungguhan. Tujuannya
// satu: layar yang menampilkan naskah terlihat seperti dipakai orang.

const kata = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
const adaKopi = (inf, prod) => /kopi|kafe|barista/i.test(`${inf?.niche || ""} ${inf?.name || ""} ${prod?.name || ""}`);

export function tulis(body, { inf, prod, item, board, shot }) {
  const kind = body.kind || "script";
  const nama = (inf?.name || "Kamu").split(" ")[0];
  const kopi = adaKopi(inf, prod);
  const produk = prod?.name || (kopi ? "Kopi Susu Aren Senja" : "produk ini");

  if (kind === "persona") {
    const foto = Array.isArray(body.photos) ? body.photos : [];
    const a = body.answers || {};
    return {
      ok: true, photo_urls: foto.length ? foto : [], photos_failed: [],
      persona: {
        names: ["Maya Kusuma", "Sinta Wibowo", "Laras Ayu"], handles: ["@maya.harian", "@sinta.cerita", "@laras.ayu"],
        niche: a.niche || "gaya hidup harian",
        bio: "Perempuan 28 tahun yang bercerita tentang keseharian dengan jujur dan hangat. Suka mencoba hal kecil yang membuat hari lebih ringan, lalu membagikannya seperti ke teman dekat.",
        identity_prompt: "Indonesian woman in her late 20s, warm medium-tan skin, oval face, shoulder-length dark brown hair with soft waves, dark brown eyes, natural eyebrows, friendly genuine smile",
        style_notes: "Cahaya jendela yang lembut, warna hangat krem dan oranye, latar rumah yang rapi dan nyaman, tampilan seperti direkam dengan ponsel.",
      },
    };
  }
  if (kind === "lookalike") {
    const face = body.aspect !== "ambience";
    return {
      ok: true, aspect: body.aspect, photo_urls: body.photos || [], photos_failed: [],
      lookalike: {
        identity_prompt: face ? "Indonesian woman in her late 20s, warm tan skin, oval face, long dark wavy hair, dark brown eyes, gentle smile" : "",
        style_notes: face ? "" : "warm golden-hour window light, cozy cafe interior, shallow depth of field, soft film grain, amber and cream palette",
        summary: face ? "Wajah oval dengan rambut hitam bergelombang, kulit sawo matang, dan senyum yang lembut." : "Suasana kafe yang hangat dengan cahaya sore keemasan dan warna krem.",
      },
    };
  }
  if (kind === "dari_dokumen") {
    const j = (jawaban) => ({ jawaban, kutipan: jawaban.slice(0, 60) });
    return {
      ok: true, ditolak: [], kosong: ["q12"], terpotong: false, catatan: "Beberapa jawaban disusun dari dua paragraf pertama dokumen.",
      usulan: {
        q1: j("Penjual kue kering rumahan di Bekasi yang membuat semuanya sendiri."),
        q2: j("Ibu muda yang ingin kue kering enak untuk keluarga tanpa repot memanggang."),
        q3: j("Kue kering toko terlalu manis dan sering sudah tidak renyah saat sampai."),
        q4: j("Kue kering renyah yang dikirim cepat dan aman sampai rumah."),
        q5: j("Sudah lima tahun berjualan dan hampir semua pelanggan memesan lagi."),
        q6: j("Kue kering dalam toples dan paket hampers."), q7: j("Rp 45.000 – Rp 150.000"),
      },
    };
  }
  if (kind === "blueprint") {
    const a = body.answers || {};
    const bp = {
      positioning: `Untuk ${(a.q2 || "audiens yang tepat").replace(/\.$/, "")}, ${nama} membantu ${(a.q4 || "mendapat hasil yang mereka inginkan").toLowerCase().replace(/\.$/, "")} lewat cerita sehari-hari yang jujur dan mudah dicoba.`,
      usp: [a.q1 ? a.q1.replace(/\.$/, "") : "Pengalaman langsung yang dibagikan apa adanya", a.q5 && !/belum/i.test(a.q5) ? a.q5.replace(/\.$/, "") : "Berangkat dari kebiasaan nyata, bukan teori", "Mudah ditiru tanpa alat atau biaya besar"],
      audience: { who: a.q2 || "Pekerja kantoran 22–35 tahun", pain: a.q3 || "Waktu sempit dan tidak tahu harus mulai dari mana", desire: a.q4 || "Hasil nyata yang bisa dijaga", language: "nggak sempat, ribet, pengin yang praktis, yang penting konsisten" },
      pillars: String(a.q9 || "dasar, kebiasaan kecil, mitos, cerita pribadi").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4).map((n, i) => ({
        name: n.charAt(0).toUpperCase() + n.slice(1),
        why: ["Audiens butuh langkah pertama yang jelas.", "Kebiasaan kecil terasa bisa dilakukan hari ini.", "Meluruskan salah paham membuat orang percaya.", "Cerita pribadi membuat audiens merasa terwakili."][i],
      })),
      tone: { style: a.q8 || "Santai seperti ngobrol dengan teman.", do: ["pakai kata sehari-hari", "ceritakan pengalaman sendiri", "akhiri dengan ajakan ringan"], avoid: ["bahasa iklan yang kaku", "klaim berlebihan", "menggurui"] },
      funnel_ratio: { tofu: 3, mofu: 2, bofu: 1 },
      monetization: [
        { idea: a.q6 && !/belum/i.test(a.q6) ? a.q6.replace(/\.$/, "") : "Produk digital sederhana", fit: "Sudah dekat dengan topik yang paling sering dibahas." },
        { idea: "Afiliasi produk yang benar-benar dipakai", fit: "Cerita pemakaian nyata membuat rekomendasi terdengar jujur." },
        { idea: "Kelas singkat atau panduan berbayar", fit: "Audiens yang sudah percaya biasanya siap membayar untuk jalan pintas." },
      ],
    };
    return { ok: true, blueprint: bp };
  }
  if (kind === "ideas") {
    const kopiIdeas = [
      ["Kenapa kopi susu botolan sering terlalu manis dan cara memilihnya", "Resep & seduh di rumah", "tofu", "Audiens sering kecewa pada kopi botolan dan ingin tahu cara memilih."],
      ["Tiga kesalahan saat membuat es kopi susu di rumah", "Resep & seduh di rumah", "tofu", "Mereka ingin hasil sekelas kafe tanpa mesin mahal."],
      ["Ritual kopi saat lembur sampai malam", "Cerita jam kerja panjang", "tofu", "Banyak yang merasa lembur tanpa kopi itu mustahil."],
      ["Cerita pertama kali jual kopi susu ke tetangga", "Cerita jam kerja panjang", "mofu", "Cerita awal yang jujur membangun rasa percaya."],
      ["Gula aren asli vs sirup: bedanya terasa di tegukan terakhir", "Kopi susu Senja", "mofu", "Membantu audiens memahami alasan di balik rasa yang berbeda."],
      ["Cara menyimpan kopi susu botol supaya rasanya tetap enak", "Kopi susu Senja", "mofu", "Pertanyaan praktis yang sering muncul sesudah membeli."],
      ["Isi tas kerjaku: botol kopi, notes, dan satu camilan", "Cerita jam kerja panjang", "tofu", "Format ringan yang mudah dibagikan."],
      ["Paket langganan kopi susu mingguan: apa saja yang kamu dapat", "Kopi susu Senja", "bofu", "Ajakan beli yang jelas untuk yang sudah percaya."],
      ["Tiga kafe tenang di Jakarta Selatan untuk kerja remote", "Sudut kafe Jakarta", "tofu", "Daftar tempat mudah disimpan dan dikirim ke teman."],
      ["Pesan sekarang, kirim besok: kopi susu aren untuk kantormu", "Kopi susu Senja", "bofu", "Memudahkan keputusan membeli untuk satu kantor."],
    ];
    const fitIdeas = [
      ["Peregangan leher dua menit di sela rapat Zoom", "Gerak 5 menit di kantor", "tofu", "Pekerja kantoran pegal tapi merasa tidak punya waktu."],
      ["Kenapa naik tangga lebih ampuh dari yang kamu kira", "Kebiasaan kecil", "tofu", "Mengubah kebiasaan kecil terasa lebih mungkin dari program besar."],
      ["Mitos: harus olahraga satu jam supaya terasa", "Mitos kebugaran", "tofu", "Meluruskan salah paham yang sering membuat orang menyerah."],
      ["Tiga gerakan di meja kerja tanpa alat", "Gerak 5 menit di kantor", "mofu", "Langkah nyata yang bisa dicoba hari ini juga."],
      ["Cerita aku mulai olahraga lagi setelah dua tahun duduk terus", "Kebiasaan kecil", "mofu", "Cerita jujur membangun kepercayaan."],
      ["Rutinitas lima menit sebelum makan siang", "Gerak 5 menit di kantor", "mofu", "Mudah diikuti dan mudah diulang."],
      ["Berapa langkah sehari yang sebenarnya cukup", "Mitos kebugaran", "tofu", "Angka yang jelas lebih mudah diingat."],
      ["Program 14 hari gerak ringan untuk pekerja kantoran", "Kebiasaan kecil", "bofu", "Ajakan bergabung yang konkret."],
      ["Sarapan cepat sebelum berangkat tanpa ribet", "Kebiasaan kecil", "tofu", "Topik yang dekat dengan rutinitas pagi."],
      ["Daftar belanja kebugaran kantor di bawah Rp 100 ribu", "Gerak 5 menit di kantor", "bofu", "Memberi alasan membeli yang masuk akal."],
    ];
    const pakai = adaKopi(inf) ? kopiIdeas : fitIdeas;
    const n = Math.min(Number(body.n) || 10, 10);
    let ideas = pakai.map(([title, pillar, funnel_stage, why]) => ({ title, pillar, funnel_stage, why }));
    if (body.pillar) ideas = ideas.filter((x) => x.pillar === body.pillar).concat(ideas.filter((x) => x.pillar !== body.pillar).map((x) => ({ ...x, pillar: body.pillar })));
    if (body.funnel_stage) ideas = ideas.map((x) => ({ ...x, funnel_stage: body.funnel_stage }));
    return { ok: true, ideas: ideas.slice(0, n) };
  }
  if (kind === "hooks") {
    const ide = String(body.idea || "ide ini").toLowerCase();
    return {
      ok: true, hooks: [
        { text: `Aku dulu salah soal ${ide.split(" ").slice(0, 4).join(" ")}, dan ternyata banyak yang begitu.`, category: "Pengakuan" },
        { text: "Pernah nggak, udah semangat tapi hasilnya begitu-begitu aja?", category: "Pertanyaan" },
        { text: "Tiga hal kecil ini yang bikin bedanya kerasa banget.", category: "Angka" },
        { text: "Kelihatannya sepele, tapi ini yang paling sering terlewat.", category: "Kontras" },
        { text: "Satu kebiasaan ini bikin harianku jauh lebih ringan.", category: "Janji" },
      ],
    };
  }
  if (kind === "script" || kind === "remix") {
    const judul = item?.title || body.idea || "ide ini";
    const hook = body.hook || (kopi ? "Jujur ya, kopi susu buatanku dulu sering hambar." : "Aku dulu nggak percaya ini bisa dilakukan sehari-hari.");
    const isi = kopi
      ? "Ternyata masalahnya bukan di kopinya, tapi di es batu yang mencair duluan.\nSekarang aku seduh pekat, dinginkan sebentar, baru tuang susunya.\nHasilnya pekat, nggak encer, dan manisnya pas."
      : "Mulai dari yang paling kecil: dua menit saja di sela pekerjaan.\nBukan soal berapa lama, tapi soal konsisten.\nCoba hari ini, besok kamu bakal lega.";
    const cta = kopi ? "Simpan videonya, dan coba besok pagi." : "Simpan dulu, lalu coba hari ini.";
    const script = [hook, isi, cta].join("\n");
    return {
      ok: true,
      draft: {
        hook, script, caption: `${judul} — coba dan ceritakan hasilnya ya.`.slice(0, 150), hashtags: kopi ? ["kopisusu", "kopirumahan", "jakarta"] : ["kebugaran", "pekerjakantoran"],
        body: isi, cta, duration_s: Math.max(8, Math.round(kata(script) / 2.3)),
        ...(kind === "remix" ? { structure_notes: ["Pembuka berupa pengakuan singkat", "Masalah disebut dalam satu kalimat", "Solusi diurutkan dalam tiga langkah", "Penutup berupa ajakan menyimpan"] } : {}),
      },
    };
  }
  if (kind === "ugc") {
    const detik = Number(body.target_seconds) || 15;
    const anggaran = Math.round(detik * 2.3);
    const sp = (prod?.selling_points || []).filter(Boolean);
    const kalimat = kopi ? [
      `Jujur ya, aku dulu nggak percaya kopi susu botolan bisa seenak buatan sendiri.`,
      `Terus aku coba ${produk}, dan manisnya pas banget, nggak nyangkut di tenggorokan.`,
      sp[0] ? `${sp[0]}.` : "Gula arennya asli.",
      sp[1] ? `${sp[1]}.` : "Bijinya arabika pilihan.",
      sp[2] ? `${sp[2]}, jadi aman dibawa ke kantor.` : "Botolnya muat di tas dan cup holder.",
      "Kalau kamu lagi cari kopi susu yang nggak kemanisan, coba deh.",
      "Link-nya ada di bio ya.",
    ] : [
      `Jujur ya, aku dulu nggak percaya ${produk} bisa sepraktis ini.`,
      sp[0] ? `${sp[0]}.` : "Dipakai sehari-hari terasa ringan.",
      sp[1] ? `${sp[1]}.` : "Nggak ribet sama sekali.",
      "Coba deh, link-nya ada di bio ya.",
    ];
    const pilih = []; let w = 0;
    for (const k of kalimat) { if (w + kata(k) > anggaran && pilih.length >= 2) break; pilih.push(k); w += kata(k); }
    const script = pilih.join(" ");
    return {
      ok: true,
      ugc: {
        hook: pilih[0], script,
        caption: kopi ? "Gula aren asli itu rasanya lebih dalam. Kamu tim manis atau tim pekat?" : `Cerita singkat soal ${produk}. Link ada di bio.`,
        hashtags: kopi ? ["kopisusuaren", "kopisenja", "jakarta"] : ["rekomendasi", "produklokal"],
        scene: "candid selfie taken with a phone front camera at arm's length, face and shoulders clearly visible, holding the product at chest height with its label facing the camera, soft natural window light, cozy home kitchen slightly out of focus, vertical 9:16",
        delivery: "talking casually to the phone camera like a friend recommending a product, relaxed and natural, small hand gestures, briefly lifting the product into frame, genuine smiles between sentences",
        words: kata(script), est_seconds: Math.max(3, Math.round(kata(script) / 2.3)), word_budget: anggaran,
      },
    };
  }
  if (kind === "storyboard") {
    const manual = !!body.shots;
    const n = Math.min(manual ? Number(body.shots) : Math.round((Number(body.total_seconds) || 15) / 5), 8);
    const per = manual ? Number(body.seconds_per_shot) || 5 : 5;
    const idea = String(body.idea || "").trim() || "Satu hari bersama produk";
    const beats = kopi ? [
      ["Hook", "Close-up of hands pouring dark coffee over ice in a tall glass, ice crackling, warm morning light", "Pagi tanpa kopi? Nggak bisa.", "close-up"],
      ["Proses", "Medium shot of the woman pouring milk into the glass, swirling white patterns form in the coffee", "Aku seduh pekat dulu, baru tuang susu.", "medium"],
      ["Detail", "Close-up of palm sugar syrup slowly dripping into the glass, shallow depth of field", "Gula arennya asli, manisnya pelan.", "close-up"],
      ["Suasana", "Wide shot of the sunlit kitchen, the woman leaning on the wooden counter with the glass in hand", "Dapur kecil ini jadi tempat favoritku.", "wide"],
      ["Rasa", "Medium shot of her taking the first sip and smiling, eyes closing briefly", "Tegukan pertama selalu paling enak.", "medium"],
      ["Ajakan", "Wide shot of her lifting the glass towards the camera by the window, soft backlight", "Coba deh, kamu pasti ketagihan.", "wide"],
    ] : [
      ["Hook", "Medium shot of a man at an office desk rubbing his stiff neck, bright daylight from a window", "Duduk delapan jam, leher kaku?", "medium"],
      ["Masalah", "Close-up of hands on a keyboard, shoulders tense, clock on the wall behind", "Rapat berikutnya masih lama.", "close-up"],
      ["Solusi", "Medium shot of the man standing and doing a slow neck stretch beside his desk", "Dua menit peregangan sudah cukup.", "medium"],
      ["Hasil", "Wide shot of the man relaxed, smiling, stretching his arms above his head in the office", "Rasanya langsung lebih ringan.", "wide"],
      ["Ajakan", "Close-up of the man giving a thumbs up to the camera", "Coba sekarang, selagi ingat.", "close-up"],
    ];
    const shots = Array.from({ length: n }, (_, i) => {
      const b = beats[Math.min(i, beats.length - 1)];
      return { position: i + 1, photo: null, beat: i === n - 1 ? "Ajakan" : b[0], visual_prompt: b[1], narration: b[2], camera: b[3], seconds: per };
    });
    return {
      ok: true,
      storyboard: {
        title: idea.length > 60 ? idea.slice(0, 57) + "…" : idea.charAt(0).toUpperCase() + idea.slice(1),
        logline: kopi ? `${nama} menyeduh kopi susu di dapurnya, dari tuangan pertama sampai tegukan yang bikin tersenyum.` : `${nama} menunjukkan peregangan singkat yang bisa dilakukan di meja kerja.`,
        continuity: kopi ? "mustard-yellow linen shirt, small sunlit Jakarta kitchen, warm morning light, wooden counter, cream and amber palette" : "navy polo shirt, bright modern office, clean daylight, white and blue palette",
        pattern: manual ? null : (body.pattern || "bebas"), photo_urls: body.photos || [], photos_failed: [], shots,
      },
    };
  }
  if (kind === "variant") {
    return {
      ok: true, variant: {
        title: `${board?.title || "Storyboard"} · versi lain`,
        shots: (body.shots || []).length ? body.shots : [],
      },
    };
  }
  if (kind === "shot") {
    return { ok: true, shot: { ...(shot || {}), narration: "Versi baru: " + (shot?.narration || "kalimat yang lebih singkat."), beat: shot?.beat }, changed: ["narration"] };
  }
  return { ok: true };
}
