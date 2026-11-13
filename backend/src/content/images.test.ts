import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl } from "@zappaloo/shared";
import { detectImage } from "./images.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
]);

describe("the content of an upload", () => {
  it("[CNT-06] recognises JPEG, PNG and WebP by their content", () => {
    expect(detectImage(jpeg)).toEqual({ mime: "image/jpeg", extension: "jpg" });
    expect(detectImage(png)).toEqual({ mime: "image/png", extension: "png" });
    expect(detectImage(webp)).toEqual({ mime: "image/webp", extension: "webp" });
  });

  it("[CNT-06] refuses anything else, whatever its name or type says", () => {
    expect(detectImage(Buffer.from("Dies ist eine Textdatei."))).toBeUndefined();
    expect(detectImage(Buffer.from("GIF89a......"))).toBeUndefined();
    // A RIFF file that is not WebP (e.g. WAV) is not an image.
    expect(detectImage(Buffer.from("RIFF\0\0\0\0WAVEfmt "))).toBeUndefined();
    expect(detectImage(Buffer.alloc(0))).toBeUndefined();
  });
});

describe("Google Maps links", () => {
  it("[CNT-07] accepts https links to Google Maps only", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/Kirche+Muri")).toBe(true);
    expect(isGoogleMapsUrl("https://google.com/maps?q=Muri")).toBe(true);
    expect(isGoogleMapsUrl("https://maps.google.com/?q=Muri")).toBe(true);
    expect(isGoogleMapsUrl("https://goo.gl/maps/xyz")).toBe(true);
  });

  it("[CNT-07] refuses other sites, other paths, plain http and odd ports", () => {
    expect(isGoogleMapsUrl("http://maps.google.com/?q=Muri")).toBe(false);
    expect(isGoogleMapsUrl("https://www.google.com/search?q=Muri")).toBe(false);
    expect(isGoogleMapsUrl("https://example.com/maps")).toBe(false);
    expect(isGoogleMapsUrl("https://maps.google.com.evil.example/")).toBe(false);
    expect(isGoogleMapsUrl("https://maps.google.com:8443/")).toBe(false);
    expect(isGoogleMapsUrl("https://user:pw@maps.google.com/")).toBe(false);
    expect(isGoogleMapsUrl("kein Link")).toBe(false);
    expect(isGoogleMapsUrl("javascript:alert(1)")).toBe(false);
  });
});
