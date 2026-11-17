import { expect, test } from "@playwright/test";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildTestWorld } from "../backend/src/world/build.ts";

const PREVIEW_PORT = process.env.ZAPPALOO_GAME_PREVIEW_PORT ?? "5175";
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

test("[MAP-18][MAP-06][MAP-16] the standalone preview loads validated packages without the application API", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "one preview and package per browser run",
  );
  const applicationRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).port === "3000") applicationRequests.push(request.url());
  });

  await page.goto(PREVIEW_URL);
  await expect(page.getByText("Load a validated", { exact: false })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  const packageStatus = page.getByRole("status").filter({ hasText: "Testwelt" });

  const validPackage = {
    name: "test-world.tar.gz",
    mimeType: "application/gzip",
    buffer: buildTestWorld(),
  };
  await page.getByLabel("World package", { exact: true }).setInputFiles(validPackage);
  await page.getByRole("button", { name: "Load package" }).click();
  await expect(packageStatus).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByLabel("Map").locator("option")).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: "Spawn" })).toHaveValue("start");
  await expect(page.getByLabel("Figure").locator("option")).toHaveCount(2);

  await page.getByLabel("Map").selectOption({ label: "Saal" });
  await page.getByRole("combobox", { name: "Spawn" }).selectOption("start");
  await page.getByLabel("Figure").selectOption("male-guest");
  await page.getByText("Guides and view").click();
  await page.getByLabel("Collision").check();
  await page.getByLabel("Border").check();
  await page.getByRole("checkbox", { name: "Spawn" }).check();
  await page.getByLabel("Portal").check();
  await page.getByLabel("Occlusion").check();
  await page.getByLabel("Artwork only").check();
  await page.getByLabel("Zoom").selectOption("1");
  await page.getByRole("button", { name: "Reset camera" }).click();

  await page.getByLabel("World package", { exact: true }).setInputFiles({
    name: "invalid.tar.gz",
    mimeType: "application/gzip",
    buffer: Buffer.from("not a package"),
  });
  await page.getByRole("button", { name: "Load package" }).click();
  await expect(page.getByRole("alert")).toContainText("(archive)");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(packageStatus).toBeVisible({ timeout: 15_000 });

  const packageRelease = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().includes("/__game-preview/api/packages/"),
  );
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(packageStatus).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  expect((await packageRelease).status()).toBe(204);

  const watchedPackage = testInfo.outputPath("watched-world.tar.gz");
  await mkdir(dirname(watchedPackage), { recursive: true });
  await writeFile(watchedPackage, buildTestWorld());
  await page.getByLabel("Local world package path").fill(watchedPackage);
  await page.getByRole("button", { name: "Preview and watch" }).click();
  await expect(page.getByRole("button", { name: "Stop watching" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await writeFile(watchedPackage, Buffer.from("not a package"));
  await expect(page.getByRole("alert")).toContainText(
    "The selected world package does not pass validation.",
    { timeout: 10_000 },
  );
  await expect(page.locator("canvas")).toHaveCount(1);

  const replacementPackage = `${watchedPackage}.new`;
  await writeFile(replacementPackage, buildTestWorld());
  await rename(replacementPackage, watchedPackage);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const response = await fetch("/__game-preview/api/local-package/status");
          if (!response.ok) throw new Error("Could not read local package preview status");
          const status: unknown = await response.json();
          if (typeof status !== "object" || status === null || !("revision" in status)) {
            throw new Error("Local package preview status has no revision");
          }
          return status.revision;
        }),
      { timeout: 10_000 },
    )
    .toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop watching" }).click();
  await expect(page.getByRole("button", { name: "Stop watching" })).toHaveCount(0);
  expect(applicationRequests).toEqual([]);
});

test("[MAP-18] the production frontend and server do not expose the standalone preview", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "one production boundary check is sufficient",
  );
  const assetDirectory = resolve("frontend/dist/assets");
  const assets = await readdir(assetDirectory);
  const bundles = await Promise.all(
    assets
      .filter((asset) => asset.endsWith(".js"))
      .map((asset) => readFile(resolve(assetDirectory, asset), "utf8")),
  );
  const productionBundle = bundles.join("\n");
  expect(productionBundle).not.toContain("/__game-preview/api");
  expect(productionBundle).not.toContain("Guides and view");
  expect(productionBundle).not.toContain("Select a validated");
  expect(await readdir("frontend/dist")).not.toContain("game-preview");

  const previewEndpoint = await request.get("/__game-preview/api/health");
  expect(previewEndpoint.status()).toBe(404);
});
