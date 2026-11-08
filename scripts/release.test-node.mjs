import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  assertTagTarget,
  checkPackedFiles,
  packageName,
  preventLatestRollback,
  publicationPreflight,
  registryVersion,
  releaseInfo,
  verifyIntegrity,
  waitForRegistryVersion,
} from "./release.mjs";

function fixture(version = "0.6.0") {
  const pkg = {
    name: packageName,
    version,
    publishConfig: { access: "public" },
    repository: { url: "https://github.com/gilhrpenner/convex-files-control" },
  };
  const lock = {
    name: pkg.name,
    version,
    packages: { "": { name: pkg.name, version } },
  };
  const changelog = `# Changelog\n\n## ${version} (2026-11-08)\n\n### Fixed\n\n- Uploads. See [evidence](docs/report.md).\n\n## 0.5.9\n\n- Older notes.\n`;
  return { pkg, lock, changelog };
}
function info(version) {
  const f = fixture(version);
  return releaseInfo(f.pkg, f.lock, f.changelog);
}
const response = (status, body) => async () => ({
  status,
  ok: status === 200,
  json: async () => body,
});

test("release notes select one version, preserve subheadings, and resolve relative links", () => {
  const release = info("0.6.0");
  assert.equal(release.tag, "v0.6.0");
  assert.equal(release.distTag, "latest");
  assert.equal(release.prerelease, false);
  assert.match(release.notes, /### Fixed/);
  assert.match(release.notes, /blob\/v0\.6\.0\/docs\/report\.md/);
  assert.doesNotMatch(release.notes, /Older notes/);
});

test("prereleases never use latest", () => {
  for (const channel of ["alpha", "beta", "rc"]) {
    const release = info(`0.7.0-${channel}.2`);
    assert.equal(release.distTag, channel);
    assert.equal(release.prerelease, true);
  }
});

test("invalid or injectable versions fail before output or shell commands", () => {
  for (const version of [
    "v0.6.0",
    "0.06.0",
    "0.6.0-alpha.01",
    "0.6.0-latest.1",
    "0.6.0\nBAD=yes",
    "0.6.0;echo unsafe",
  ]) {
    assert.throws(() => info(version), /stable version/);
  }
});

test("package identity, repository, and both lockfile versions are enforced", () => {
  const f = fixture();
  assert.throws(
    () =>
      releaseInfo({ ...f.pkg, name: "another-package" }, f.lock, f.changelog),
    /package name/,
  );
  assert.throws(
    () => releaseInfo({ ...f.pkg, private: true }, f.lock, f.changelog),
    /package name/,
  );
  assert.throws(
    () =>
      releaseInfo(
        { ...f.pkg, repository: { url: "https://example.com" } },
        f.lock,
        f.changelog,
      ),
    /repository/,
  );
  assert.throws(
    () => releaseInfo(f.pkg, { ...f.lock, version: "0.5.9" }, f.changelog),
    /same version/,
  );
  f.lock.packages[""].version = "0.5.9";
  assert.throws(() => releaseInfo(f.pkg, f.lock, f.changelog), /same version/);
});

test("missing, empty, or duplicate release notes block publication", () => {
  const f = fixture();
  for (const changelog of [
    "# Changelog",
    "## 0.6.0\n\n## 0.5.9\nOld",
    `${f.changelog}\n## 0.6.0\nDuplicate`,
  ]) {
    assert.throws(
      () => releaseInfo(f.pkg, f.lock, changelog),
      /changelog|CHANGELOG/,
    );
  }
  assert.equal(
    releaseInfo(f.pkg, f.lock, "## 0.6.0\nLast section\n").notes,
    "Last section",
  );
});

test("tag creation and retries never move a different commit", () => {
  assert.doesNotThrow(() => assertTagTarget(null, "new"));
  assert.doesNotThrow(() => assertTagTarget("same", "same"));
  assert.throws(() => assertTagTarget("old", "new"), /never moved/);
});

test("artifact tampering is rejected", () => {
  const bytes = Buffer.from("release tarball");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.equal(verifyIntegrity(bytes, integrity), integrity);
  assert.throws(
    () => verifyIntegrity(Buffer.from("changed"), integrity),
    /integrity mismatch/,
  );
});

test("packed exports must exist and sensitive/development files are excluded", () => {
  const files = [
    "package.json",
    "README.md",
    "LICENSE",
    "src/test.ts",
    "dist/client/index.js",
    "dist/react/index.js",
    "dist/component/convex.config.js",
    "dist/component/_generated/component.d.ts",
  ];
  assert.doesNotThrow(() => checkPackedFiles(files));
  assert.throws(
    () => checkPackedFiles(files.slice(1)),
    /Missing published file/,
  );
  for (const extra of [
    "src/client/index.test.ts",
    "src/__tests__/fixture.ts",
    ".env.local",
    "example/.env",
    "node_modules/a/index.js",
  ]) {
    assert.throws(
      () => checkPackedFiles([...files, extra]),
      /Package contains/,
    );
  }
});

test("only 404 is treated as an unpublished version", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  assert.equal(await registryVersion(release, response(404)), false);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      registryVersion(release, response(status)),
      /Registry lookup failed/,
    );
  }
  await assert.rejects(
    registryVersion(release, async () => {
      throw new Error("network unavailable");
    }),
    /network unavailable/,
  );
});

test("retry accepts identical published bytes and rejects a version collision", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  const published = {
    name: release.name,
    version: release.version,
    dist: { integrity: release.integrity },
  };
  assert.equal(await registryVersion(release, response(200, published)), true);
  await assert.rejects(
    registryVersion(
      release,
      response(200, { ...published, dist: { integrity: "different" } }),
    ),
    /different contents/,
  );
  await assert.rejects(
    registryVersion(release, response(200, { ...published, version: "0.5.9" })),
    /different contents/,
  );
});

test("GitHub release waits for npm processing and verifies the resulting bytes", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  const published = {
    name: release.name,
    version: release.version,
    dist: { integrity: release.integrity },
  };
  let lookups = 0;
  const delays = [];
  await waitForRegistryVersion(
    release,
    async () => {
      lookups++;
      return response(lookups < 3 ? 404 : 200, published)();
    },
    async (ms) => delays.push(ms),
  );
  assert.equal(lookups, 3);
  assert.deepEqual(delays, [15_000, 15_000]);
});

test("GitHub release stops after a bounded wait if npm never exposes the version", async () => {
  let lookups = 0;
  const delays = [];
  await assert.rejects(
    waitForRegistryVersion(
      info(),
      async () => {
        lookups++;
        return response(404)();
      },
      async (ms) => delays.push(ms),
    ),
    /npm publication must be verified/,
  );
  assert.equal(lookups, 13);
  assert.equal(delays.length, 12);
});

test("waiting for publication fails immediately on registry errors or different bytes", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  for (const fetcher of [
    response(401),
    response(403),
    response(429),
    response(500),
    response(200, {
      name: release.name,
      version: release.version,
      dist: { integrity: "different" },
    }),
    async () => {
      throw new Error("network unavailable");
    },
  ]) {
    let lookups = 0;
    await assert.rejects(
      waitForRegistryVersion(
        release,
        async (...args) => {
          lookups++;
          return fetcher(...args);
        },
        async () => assert.fail("only a missing version should be retried"),
      ),
      /Registry lookup failed|different contents|network unavailable/,
    );
    assert.equal(lookups, 1);
  }
});

test("an old tag cannot roll npm latest backwards", async () => {
  await preventLatestRollback(
    info("0.10.0"),
    response(200, { version: "0.9.0" }),
  );
  await preventLatestRollback(info(), response(404));
  await preventLatestRollback(info("0.6.0-alpha.1"), async () => {
    throw new Error("prerelease must not query latest");
  });
  for (const version of ["0.6.0", "0.7.0", "1.0.0"]) {
    await assert.rejects(
      preventLatestRollback(info(), response(200, { version })),
      /backwards/,
    );
  }
  await assert.rejects(
    preventLatestRollback(info(), response(500)),
    /lookup failed/,
  );
});

test("publication preflight supplies the selected prerelease channel to npm", async () => {
  for (const channel of ["alpha", "beta", "rc"]) {
    const release = info(`0.7.0-${channel}.1`);
    const calls = [];
    assert.equal(
      await publicationPreflight(release, response(404), (...args) =>
        calls.push(args),
      ),
      false,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "npm",
      [
        "publish",
        `./release/${release.filename}`,
        "--dry-run",
        "--ignore-scripts",
        "--access",
        "public",
        "--tag",
        channel,
      ],
    ]);
  }
});

test("fresh publication preflight accepts identical published bytes without invoking npm publish", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  const published = {
    name: release.name,
    version: release.version,
    dist: { integrity: release.integrity },
  };
  assert.equal(
    await publicationPreflight(release, response(200, published), () => {
      assert.fail(
        "npm publish must be skipped even for a dry run of an existing version",
      );
    }),
    true,
  );
});

test("publication preflight rejects collisions and registry outages before invoking npm", async () => {
  const release = { ...info(), integrity: "sha512-example" };
  const mustNotPublish = () =>
    assert.fail("npm publish must not run after a failed registry guard");
  await assert.rejects(
    publicationPreflight(
      release,
      response(200, {
        name: release.name,
        version: release.version,
        dist: { integrity: "different" },
      }),
      mustNotPublish,
    ),
    /different contents/,
  );
  await assert.rejects(
    publicationPreflight(release, response(500), mustNotPublish),
    /Registry lookup failed/,
  );
});
