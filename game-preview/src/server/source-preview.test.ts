import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestWorld } from "../../../backend/src/world/build.ts";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewPackageStore } from "./package-store.ts";
import { LocalPackagePreview } from "./source-preview.ts";

const temporaryDirectories: string[] = [];

async function createPackageFile(contents: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zappaloo-preview-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "world.tar.gz");
  await writeFile(path, contents);
  return path;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("local world package preview (MAP-18)", () => {
  it("[MAP-18][MAP-06][MAP-16] watches an absolute package path, reloads valid changes, and retains the last valid snapshot on errors", async () => {
    const archivePath = await createPackageFile(buildTestWorld());
    const packages = new PreviewPackageStore();
    const preview = new LocalPackagePreview(packages);

    const initial = await preview.start(archivePath);
    const firstToken = initial.snapshot?.token;
    expect(initial.active).toBe(true);
    expect(initial.archivePath).toBe(archivePath);
    expect(initial.revision).toBe(1);
    expect(firstToken).toBeDefined();

    await writeFile(archivePath, Buffer.from("not a package"));
    await wait(450);
    expect(preview.status().error?.findings).toHaveLength(1);
    expect(preview.status().snapshot?.token).toBe(firstToken);
    expect(packages.file(firstToken ?? "", "maps/kirche.json")).toBeDefined();

    const replacementPath = `${archivePath}.new`;
    await writeFile(replacementPath, buildTestWorld());
    await rename(replacementPath, archivePath);
    await wait(450);
    const recovered = preview.status();
    expect(recovered.error).toBeUndefined();
    expect(recovered.revision).toBe(2);
    expect(recovered.snapshot?.token).not.toBe(firstToken);
    expect(packages.file(firstToken ?? "", "maps/kirche.json")).toBeUndefined();

    preview.stop();
  });

  it("[MAP-18] reports missing packages and loads one when it is created", async () => {
    const archivePath = await createPackageFile(Buffer.alloc(0));
    const packages = new PreviewPackageStore();
    const preview = new LocalPackagePreview(packages);
    await rm(archivePath);

    const missing = await preview.start(archivePath);
    expect(missing.active).toBe(true);
    expect(missing.error?.message).toContain("ENOENT");
    expect(missing.snapshot).toBeUndefined();

    await writeFile(archivePath, buildTestWorld());
    await wait(450);
    expect(preview.status().revision).toBe(1);
    expect(preview.status().error).toBeUndefined();
    preview.stop();
  });

  it("[MAP-18] refuses relative paths and stops watching without discarding the loaded package", async () => {
    const packages = new PreviewPackageStore();
    const preview = new LocalPackagePreview(packages);
    const relativePath = await preview.start("world.tar.gz");
    expect(relativePath.active).toBe(false);
    expect(relativePath.error?.message).toContain("absolute");

    const archivePath = await createPackageFile(buildTestWorld());
    const started = await preview.start(archivePath);
    const token = started.snapshot?.token;
    const stopped = preview.stop();

    expect(stopped.active).toBe(false);
    expect(stopped.snapshot?.token).toBe(token);
    expect(packages.file(token ?? "", "maps/kirche.json")).toBeDefined();

    await writeFile(archivePath, Buffer.from("changed after stop"));
    await wait(450);
    expect(preview.status().revision).toBe(1);
    expect(preview.status().error).toBeUndefined();
  });
});
