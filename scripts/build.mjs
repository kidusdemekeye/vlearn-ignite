// Builds the static site into dist/ for normal hosting (Vercel, GitHub Pages).
// app/index.html is written without a document shell (the Claude host adds one), so add it here.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("app", "dist", { recursive: true });
const page = readFileSync("app/index.html", "utf8");
writeFileSync("dist/index.html",
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' +
  page + "\n</body></html>\n");
writeFileSync("dist/.nojekyll", "");
console.log("built dist/");
