import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

// A guest adds the site to the home screen: the page links the manifest and the iOS icon, and
// everything they point to is served, without a sign-in (PWA-01 – PWA-03).
test("[PWA-01][PWA-02][PWA-03] the page head links a manifest whose icons load", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");
  const manifestResponse = await request.get(manifestHref ?? "");
  expect(manifestResponse.status()).toBe(200);
  const manifest = (await manifestResponse.json()) as {
    display: string;
    icons: { src: string; type: string }[];
  };
  expect(manifest.display).toBe("standalone");
  const hrefs = [
    ...manifest.icons.map((icon) => icon.src),
    (await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")) ?? "",
  ];
  expect(hrefs.length).toBe(4);
  for (const href of hrefs) {
    const icon = await request.get(href);
    expect(icon.status(), href).toBe(200);
    expect(icon.headers()["content-type"]).toBe("image/png");
  }
  // The title of the page, and so of the home screen icon on iOS, is the event's name.
  await expect(page).toHaveTitle(/\S/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
});

// A guest on a phone finds the hint in the profile and reads the steps for their platform;
// desktop browsers get no hint (PWA-05).
test("[PWA-05] a phone's profile offers the install page with the steps for iOS or Android", async ({
  page,
  context,
}, testInfo) => {
  const project = testInfo.project.name;
  test.skip(!project.startsWith("mobile-"), "the hint is for mobile browsers");
  await signInAsAdmin(page, context);
  await page.goto("/profile");
  await page.getByRole("link", { name: de.install.cardButton }).click();
  await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByText(de.install.title, { exact: true })).toBeVisible();
  if (project === "mobile-ios") {
    await expect(page.getByText(de.install.ios.title)).toBeVisible();
    await expect(page.getByText("Zum Home-Bildschirm", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(de.install.android.title)).toBeVisible();
  }
  await expect(page.getByText(/meldest du dich einmal neu an/)).toBeVisible();
});

test("[PWA-05] a desktop browser's profile has no install card", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "desktop only");
  await signInAsAdmin(page, context);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: de.profile.title })).toBeVisible();
  await expect(page.getByRole("link", { name: de.install.cardButton })).toHaveCount(0);
});
