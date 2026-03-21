import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const missingJsExtension = [];
const relativeSpecifierPattern =
  /(import|export)\s+(?:[^;]*?\s+from\s+)?["'](\.\.?\/[^"'?#]+(?:[?#][^"']*)?)["']/g;

for (const file of globSync("dist/**/*.js").sort()) {
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const match of source.matchAll(relativeSpecifierPattern)) {
    const specifier = match[2];
    const normalizedSpecifier = specifier.split(/[?#]/, 1)[0];
    if (!normalizedSpecifier.endsWith(".js")) {
      missingJsExtension.push(`${file}: ${specifier}`);
    }
  }
}

if (missingJsExtension.length > 0) {
  console.error("Found dist imports without explicit .js extensions:");
  for (const entry of missingJsExtension) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

for (const entrypoint of [
  "dist/client/index.js",
  "dist/react/index.js",
  "dist/shared.js",
]) {
  await import(pathToFileURL(resolve(entrypoint)).href);
}

console.log("Verified dist ESM entrypoints.");
