import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

describe("pinned Tiled tooling and private-world boundaries", () => {
  it("[MAP-18] pins the development Tiled editor and verifies its checksum", () => {
    const installer = read("scripts/tiled/install.sh");
    expect(installer).toContain("version=1.12.2");
    expect(installer).toContain(
      "sha256=5e0edbff61314f41af3c72c21ec006b363cf12047cc9cfb5bbd63a98bca3721c",
    );
    expect(installer).toContain("sha256sum --check");
    expect(installer).toContain("xvfb-run -a");
    expect(installer).toContain("uname -m");
    expect(installer).toContain("x86_64-only");
  });

  it("[MAP-18] launches Tiled on the desktop display when available", () => {
    const installer = read("scripts/tiled/install.sh");
    expect(installer).toContain('if [ -n "${DISPLAY:-}" ]; then');
    expect(installer).toContain('exec \\"$install_dir/root/AppRun\\"');
    expect(installer).toContain("exec xvfb-run -a");
  });

  it("[MAP-18] excludes private source and generated-world directories from Git and Docker", () => {
    for (const file of [".gitignore", ".dockerignore"]) {
      const rules = read(file);
      expect(rules, file).toContain("/world/");
      expect(rules, file).toContain("/world-scratch/");
    }
  });

  it("[MAP-18] installs Tiled only in the development container", () => {
    expect(read(".devcontainer/Dockerfile")).toContain("scripts/tiled/install.sh");
    expect(read(".devcontainer/Dockerfile")).toContain("arm64");
    const ci = read(".github/workflows/ci.yml");
    expect(ci).not.toContain("scripts/tiled/install.sh");
    expect(ci).not.toMatch(/\b(?:libegl1|libfontconfig1|libgl1|squashfs-tools|xvfb|xauth)\b/);
    expect(read("infrastructure/docker/Dockerfile")).not.toMatch(/tiled/i);
  });
});
