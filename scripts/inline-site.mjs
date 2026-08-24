// Gabungkan hasil `vite build` menjadi satu file HTML mandiri di site/index.html
// (dipakai edge function `app` sebagai sumber hosting), plus salin halaman legal.
// Jalankan: npm run build:site
import fs from "fs";

let html = fs.readFileSync("dist/index.html", "utf8");
const jsFile = fs.readdirSync("dist/assets").find((f) => f.endsWith(".js"));
let js = fs.readFileSync("dist/assets/" + jsFile, "utf8");

// Escape agar bundel tidak menutup <script> lebih awal.
js = js.split("</" + "script").join("<\\/script");

html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, "");
// function replacement supaya $&, $', $` di bundel React tidak dianggap pattern.
html = html.replace(
  /<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/,
  () => '<script type="module">\n' + js + "\n</" + "script>"
);

fs.mkdirSync("site", { recursive: true });
fs.writeFileSync("site/index.html", html);
fs.copyFileSync("public/privacy.html", "site/privacy.html");
fs.copyFileSync("public/terms.html", "site/terms.html");

const closes = (html.match(/<\/script>/g) || []).length;
console.log("site/index.html:", html.length, "bytes | </script> count:", closes, closes === 1 ? "(ok)" : "(HARUS 1!)");
