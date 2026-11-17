import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = dirname(HERE);
const REPO = dirname(dirname(MOD));
const SHARED = process.env.HERDR_SHARED || join(homedir(), "git-repo", "herdr-shared");
const SKIP = existsSync(join(SHARED, "tools/vendor.sh")) ? false : `herdr-shared is not checked out at ${SHARED}`;

const VENDORED = [
  ["bin/cca", "mods/regent/cca"],
  ["bin/usage-tap.sh", "mods/regent/usage-tap.sh"],
  ["bin/usage-api.mjs", "mods/regent/usage-api.mjs"],
  ["bin/codex-usage.mjs", "mods/regent/codex-usage.mjs"],
  ["bin/models.mjs", "mods/regent/models.mjs"],
  ["bin/scan.sh", "mods/regent/scan.sh"],
  ["tools/merge-keys.py", "tools/merge-keys.py"],
];

test("vendored files match herdr-shared byte for byte and keep the exec bit", { skip: SKIP }, () => {
  for (const [from, to] of VENDORED) {
    const source = join(SHARED, from);
    const copy = join(REPO, to);
    assert.deepEqual(readFileSync(copy), readFileSync(source), `${to} differs from ${from}; re-vendor it from herdr-shared`);
    if (statSync(source).mode & 0o111) {
      assert.ok(statSync(copy).mode & 0o111, `${to} lost the exec bit of ${from}`);
    }
  }
});

function install(root, app, sharedHome) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "herdr-app"), 0o755);
  execFileSync("sh", [join(REPO, "tools/install.sh")], {
    env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, HERDR_APP_HOME: app, HERDR_SHARED_HOME: sharedHome, HERDR_SHARED: SHARED,
    },
    stdio: "pipe",
  });
}

function sandboxApp(root) {
  const app = join(root, "app");
  const sharedHome = join(root, "shared");
  mkdirSync(join(app, "mods"), { recursive: true });
  mkdirSync(sharedHome);
  writeFileSync(join(sharedHome, "cca"), "#!/bin/sh\n");
  return { app, sharedHome };
}

test("install.sh never links an installed mod that resolves into this repo", { skip: SKIP }, () => {
  const root = mkdtempSync(join(tmpdir(), "regent-install-"));
  try {
    const { app, sharedHome } = sandboxApp(root);
    symlinkSync(join(REPO, "mods/regent"), join(app, "mods/regent"));
    install(root, app, sharedHome);
    assert.ok(lstatSync(join(REPO, "mods/regent/cca")).isFile(), "the repo's cca became a link");
    assert.ok(lstatSync(join(REPO, "mods/regent/scan.sh")).isFile(), "the repo's scan.sh became a link");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install.sh links a separately copied install to the shared home", { skip: SKIP }, () => {
  const root = mkdtempSync(join(tmpdir(), "regent-install-"));
  try {
    const { app, sharedHome } = sandboxApp(root);
    install(root, app, sharedHome);
    const installed = join(app, "mods/regent/cca");
    assert.ok(lstatSync(installed).isSymbolicLink(), "the installed cca stayed a copy");
    assert.equal(readlinkSync(installed), join(sharedHome, "cca"));
    assert.ok(lstatSync(join(REPO, "mods/regent/cca")).isFile(), "the repo's cca was touched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const LINKED = ["cca", "usage-tap.sh", "usage-api.mjs", "codex-usage.mjs", "models.mjs", "scan.sh"];

test("a second install writes real files instead of writing through the shared links", { skip: SKIP }, () => {
  const root = mkdtempSync(join(tmpdir(), "regent-install-"));
  try {
    const app = join(root, "app");
    const sharedHome = join(root, "herdr-shared");
    mkdirSync(app, { recursive: true });
    execFileSync("sh", [join(SHARED, "tools/install.sh")], {
      env: { ...process.env, HERDR_SHARED_HOME: sharedHome },
      stdio: "pipe",
    });

    const assertLinked = (when) => {
      for (const name of LINKED) {
        const installed = join(app, "mods/regent", name);
        assert.ok(lstatSync(installed).isSymbolicLink(), `regent/${name} is a link ${when}`);
        assert.equal(readlinkSync(installed), join(sharedHome, name), `regent/${name} points at the shared home ${when}`);
      }
    };

    install(root, app, sharedHome);
    assertLinked("after the first install");

    // The marker stands in for the shared home drifting from this repo's vendored copy: a copy
    // that wrote through the link would replace it.
    const marker = "#!/bin/sh\n# marker: a reinstall must not write through the link\n";
    const marked = join(sharedHome, "cca");
    writeFileSync(marked, marker);

    install(root, app, sharedHome);
    assertLinked("after the second install");
    assert.equal(readFileSync(marked, "utf8"), marker, "the second install wrote through the link into the shared home");
    for (const name of LINKED) {
      if (name === "cca") continue;
      assert.deepEqual(readFileSync(join(sharedHome, name)), readFileSync(join(SHARED, "bin", name)),
        `the shared home's ${name} still matches herdr-shared after the second install`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
