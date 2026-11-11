import { expect, test } from "@playwright/test";

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
