import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const packageName = "@gilhrpenner/convex-files-control";
const repository = "gilhrpenner/convex-files-control";
const registry = "https://registry.npmjs.org";

export function releaseInfo(pkg, lock, changelog) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(
      pkg.version,
    );
  if (!match)
    throw new Error(
      "Use a stable version or an alpha.N, beta.N, or rc.N prerelease.",
    );
  if (
    pkg.name !== packageName ||
    pkg.private ||
    pkg.publishConfig?.access !== "public"
  ) {
    throw new Error("Unexpected package name or publishing configuration.");
  }
  if (pkg.repository?.url !== `https://github.com/${repository}`) {
    throw new Error("Package repository must match the trusted publisher.");
  }
  if (
    lock.name !== pkg.name ||
    lock.version !== pkg.version ||
    lock.packages?.[""]?.name !== pkg.name ||
    lock.packages?.[""]?.version !== pkg.version
  ) {
    throw new Error(
      "package.json and package-lock.json must name the same version.",
    );
  }
  const sections = [
    ...changelog.matchAll(/^## (\S+)[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm),
  ];
  const section = sections.find((entry) => entry[1] === pkg.version);
  if (!section || !section[2].trim())
    throw new Error(`Missing changelog notes for ${pkg.version}.`);
  if (sections.filter((entry) => entry[1] === pkg.version).length !== 1) {
    throw new Error("Duplicate release heading in CHANGELOG.md.");
  }
  return {
    name: pkg.name,
    version: pkg.version,
    tag: `v${pkg.version}`,
    distTag: match[4] ?? "latest",
    prerelease: Boolean(match[4]),
    filename: `gilhrpenner-convex-files-control-${pkg.version}.tgz`,
    notes: section[2]
      .trim()
      .replace(
        /\]\((?!https?:|#)([^)]+)\)/g,
        `](https://github.com/${repository}/blob/v${pkg.version}/$1)`,
      ),
  };
}

export function assertTagTarget(existing, expected) {
  if (existing && existing !== expected) {
    throw new Error(
      `Release tag already points to ${existing}, not ${expected}. Existing tags are never moved.`,
    );
  }
}

export function verifyIntegrity(bytes, expected) {
  const actual = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (actual !== expected)
    throw new Error(
      "Package integrity mismatch; refusing to publish or reuse this version.",
    );
  return actual;
}

export function checkPackedFiles(files) {
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "src/test.ts",
    "dist/client/index.js",
    "dist/react/index.js",
    "dist/component/convex.config.js",
    "dist/component/_generated/component.d.ts",
  ]) {
    if (!files.includes(required))
      throw new Error(`Missing published file: ${required}`);
  }
  if (
    files.some(
      (file) =>
        /(?:^|\/)(?:__tests__|node_modules|\.github|example|\.env[^/]*)\//.test(
          file,
        ) ||
        /\.test\.[^.]+$/.test(file) ||
        /(?:^|\/)\.env(?:\.|$)/.test(file),
    )
  ) {
    throw new Error(
      "Package contains tests, dependencies, examples, or environment files.",
    );
  }
}

export async function registryVersion(info, fetcher = fetch) {
  const response = await fetcher(
    `${registry}/${encodeURIComponent(info.name)}/${info.version}`,
    {
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error(`Registry lookup failed: HTTP ${response.status}.`);
  const published = await response.json();
  if (
    published.name !== info.name ||
    published.version !== info.version ||
    published.dist?.integrity !== info.integrity
  ) {
    throw new Error(
      "This npm version already exists with different contents. Bump the version; never overwrite it.",
    );
  }
  return true;
}

export async function preventLatestRollback(info, fetcher = fetch) {
  if (info.prerelease) return;
  const response = await fetcher(
    `${registry}/${encodeURIComponent(info.name)}/latest`,
    {
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return;
  if (!response.ok)
    throw new Error(`Latest-version lookup failed: HTTP ${response.status}.`);
  const latest = (await response.json()).version;
  if (!/^\d+\.\d+\.\d+$/.test(latest))
    throw new Error("Unexpected latest version; inspect npm before releasing.");
  const previous = latest.split(".").map(Number);
  const next = info.version.split(".").map(Number);
  const difference =
    next
      .map((part, index) => part - previous[index])
      .find((part) => part !== 0) ?? 0;
  if (difference <= 0)
    throw new Error(
      `Refusing to move npm latest backwards from ${latest} to ${info.version}.`,
    );
}

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
function output(key, value) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function metadata() {
  const info = readJson("release/metadata.json");
  // Artifact paths and publish targets must not be chosen by unvalidated metadata.
  const checked = releaseInfo(
    readJson("package.json"),
    readJson("package-lock.json"),
    readFileSync("CHANGELOG.md", "utf8"),
  );
  for (const key of [
    "name",
    "version",
    "tag",
    "distTag",
    "prerelease",
    "filename",
  ]) {
    if (info[key] !== checked[key])
      throw new Error(`Unexpected artifact ${key}.`);
  }
  if (info.sha !== run("git", ["rev-parse", "HEAD"]))
    throw new Error("Artifact source commit mismatch.");
  verifyIntegrity(readFileSync(`release/${info.filename}`), info.integrity);
  return info;
}
function existingTag(tag) {
  const names = run("git", ["tag", "--list", tag]);
  return names ? run("git", ["rev-parse", `refs/tags/${tag}^{commit}`]) : null;
}

async function main(command) {
  if (command === "prepare") {
    const info = releaseInfo(
      readJson("package.json"),
      readJson("package-lock.json"),
      readFileSync("CHANGELOG.md", "utf8"),
    );
    info.sha = run("git", ["rev-parse", "HEAD"]);
    if (
      process.env.GITHUB_REF?.startsWith("refs/tags/") &&
      process.env.GITHUB_REF !== `refs/tags/${info.tag}`
    ) {
      throw new Error("Git tag and package version do not match.");
    }
    mkdirSync("release", { recursive: true });
    writeFileSync(
      "release/metadata.json",
      `${JSON.stringify(info, null, 2)}\n`,
    );
    writeFileSync(
      "release/notes.md",
      `${info.notes}\n\n[Validation run](https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? "local"})\n`,
    );
    for (const key of [
      "version",
      "tag",
      "distTag",
      "prerelease",
      "filename",
      "sha",
    ])
      output(key, info[key]);
    console.log(`Prepared ${info.tag} (${info.distTag}) from ${info.sha}.`);
  } else if (command === "pack") {
    const info = readJson("release/metadata.json");
    const [packed] = JSON.parse(
      run("npm", [
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        "release",
      ]),
    );
    if (
      packed.filename !== info.filename ||
      packed.version !== info.version ||
      packed.name !== info.name
    ) {
      throw new Error("Packed package does not match release metadata.");
    }
    checkPackedFiles(packed.files.map((file) => file.path));
    const bytes = readFileSync(`release/${packed.filename}`);
    info.integrity = verifyIntegrity(bytes, packed.integrity);
    writeFileSync(
      "release/metadata.json",
      `${JSON.stringify(info, null, 2)}\n`,
    );
    writeFileSync(
      "release/package-manifest.json",
      `${JSON.stringify(packed, null, 2)}\n`,
    );
    writeFileSync(
      "release/SHA256SUMS.txt",
      `${createHash("sha256").update(bytes).digest("hex")}  ${packed.filename}\n`,
    );
    console.log(`Packed and verified ${packed.filename}.`);
  } else if (command === "verify") {
    const info = metadata();
    console.log(`Verified ${info.filename}: ${info.integrity}`);
  } else if (command === "registry") {
    const info = metadata();
    const exists = await registryVersion(info);
    if (!exists) await preventLatestRollback(info);
    output("exists", exists);
    console.log(
      exists
        ? "Identical npm version already exists; skip publishing."
        : "Version is not yet published.",
    );
  } else if (command === "check-tag" || command === "create-tag") {
    const info = metadata();
    const target = existingTag(info.tag);
    assertTagTarget(target, info.sha);
    if (command === "create-tag" && !target) {
      const tag = JSON.parse(
        run("gh", [
          "api",
          `repos/${repository}/git/tags`,
          "-f",
          `tag=${info.tag}`,
          "-f",
          `message=Release ${info.tag}`,
          "-f",
          `object=${info.sha}`,
          "-f",
          "type=commit",
        ]),
      );
      run("gh", [
        "api",
        `repos/${repository}/git/refs`,
        "-f",
        `ref=refs/tags/${info.tag}`,
        "-f",
        `sha=${tag.sha}`,
      ]);
    }
    console.log(
      `Release tag ${info.tag}: ${target ?? (command === "create-tag" ? "created" : "will be created")}.`,
    );
  } else if (command === "github-release") {
    const info = metadata();
    if (!(await registryVersion(info)))
      throw new Error(
        "npm publication must be verified before publishing the GitHub release.",
      );
    // Distinguish a missing release from an API/authentication failure.
    const existing = JSON.parse(
      run("gh", [
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/releases?per_page=100`,
      ]),
    )
      .flat()
      .find((release) => release.tag_name === info.tag);
    if (existing && !existing.draft) {
      console.log(
        `GitHub release ${info.tag} is already public; leaving it unchanged.`,
      );
      return;
    }
    if (!existing) {
      run("gh", [
        "release",
        "create",
        info.tag,
        "--repo",
        repository,
        "--verify-tag",
        "--draft",
        "--title",
        info.tag,
        "--notes-file",
        "release/notes.md",
      ]);
    }
    run("gh", [
      "release",
      "upload",
      info.tag,
      "--repo",
      repository,
      "--clobber",
      ...[
        info.filename,
        "SHA256SUMS.txt",
        "package-manifest.json",
        "validation.log",
        "metadata.json",
        "notes.md",
      ].map((file) => `release/${file}`),
    ]);
    // Preserve curated draft release notes (including the prepared 0.6.0 notes).
    run("gh", [
      "release",
      "edit",
      info.tag,
      "--repo",
      repository,
      "--draft=false",
      `--prerelease=${info.prerelease}`,
      `--latest=${!info.prerelease}`,
    ]);
    console.log(
      `Published https://github.com/${repository}/releases/tag/${info.tag}`,
    );
  } else {
    throw new Error(
      "Expected prepare, pack, verify, registry, check-tag, create-tag, or github-release.",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main(process.argv[2]);
}
