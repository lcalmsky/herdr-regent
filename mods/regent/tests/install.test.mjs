import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

test("install.sh makes the bundled scripts runnable and leaves main.js alone", () => {
  const root = mkdtempSync(join(tmpdir(), "regent-install-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(join(home, "mods", "regent"), { recursive: true });
  writeFileSync(join(home, "mods", "regent", "cca"), "#!/bin/sh\n", { mode: 0o644 });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  chmodSync(join(bin, "herdr-app"), 0o755);

  try {
    const result = spawnSync("sh", [join(repo, "tools", "install.sh")], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HERDR_APP_HOME: home,
        HERDR_SHARED: "/nonexistent",
        HERDR_SHARED_HOME: "/nonexistent",
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `install.sh failed: ${result.stderr || result.stdout}`);

    const mode = (path) => statSync(path).mode & 0o777;
    assert.equal(mode(join(home, "mods", "regent", "cca")), 0o755);
    assert.equal(mode(join(home, "mods", "regent", "scan.sh")), 0o755);
    assert.equal(mode(join(home, "mods", "regent", "main.js")) & 0o111, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
