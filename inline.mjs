import fs from "fs";

let html = fs.readFileSync("dist/index.html", "utf8");
const jsFile = fs.readdirSync("dist/assets").find((f) => f.endsWith(".js"));
let js = fs.readFileSync("dist/assets/" + jsFile, "utf8");

// Escape any sequence that could prematurely close the inline <script>.
// Splitting the literal "</" avoids this source file itself tripping the guard.
js = js.split("</" + "script").join("<\\/script");

// remove leftover importmap if present
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, "");
// replace the built external module script tag with an INLINE module script
// IMPORTANT: use a function replacement so $&, $', $` sequences inside the
// React bundle are NOT interpreted as replacement patterns.
html = html.replace(
  /<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/,
  () => '<script type="module">\n' + js + '\n</' + 'script>'
);

fs.writeFileSync("/mnt/user-data/outputs/index.html", html);
fs.writeFileSync("/mnt/user-data/outputs/AI-Micro-Influencer-Studio.html", html);
fs.writeFileSync("/home/claude/work/AI-Micro-Influencer-Studio.html", html);

// sanity: count real closing tags (should be exactly 1 — the module script's own)
const rawClose = (html.match(/<\/script>/g) || []).length;
console.log("bytes:", html.length, "| real </script> count:", rawClose, "| esm.sh:", html.includes("esm.sh"));
