// A QR code as an image, drawn in the browser (INV-14). Pure SVG, so it prints sharply.
import { toString } from "qrcode";
import { useEffect, useState } from "react";

export default function QrCode({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => {
        if (!cancelled) setSource(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setSource(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return source ? <img src={source} alt={label} width={160} height={160} /> : null;
}
