// The invitation code in six separate boxes (UX decision 1): typing jumps to the next box,
// backspace goes back, and pasting "K7Q-MX4" fills all six (case and dashes ignored).
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { CODE_LENGTH, cleanCode } from "./code.ts";

export default function OtpInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => {
    boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus();
  };

  function put(index: number, text: string) {
    const typed = cleanCode(text);
    if (typed === "") return;
    // Several characters (a paste, or autofill) fill the boxes from here on.
    const chars = value.padEnd(CODE_LENGTH).split("");
    for (const [offset, char] of Array.from(typed).entries()) {
      if (index + offset < CODE_LENGTH) chars[index + offset] = char;
    }
    onChange(chars.join("").trimEnd().slice(0, CODE_LENGTH));
    focus(index + typed.length);
  }

  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="otp">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            className="input"
            value={value.charAt(index).trim()}
            inputMode="text"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            autoCapitalize="characters"
            aria-label={t("guest.codeChar", { n: index + 1, total: CODE_LENGTH })}
            onChange={(event) => {
              put(index, event.target.value);
            }}
            onPaste={(event) => {
              event.preventDefault();
              put(index, event.clipboardData.getData("text"));
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && value.charAt(index).trim() === "") {
                // An empty box: step back and clear the one before.
                event.preventDefault();
                onChange(value.slice(0, Math.max(0, index - 1)));
                focus(index - 1);
              } else if (event.key === "Backspace") {
                onChange(value.slice(0, index));
              } else if (event.key === "ArrowLeft") focus(index - 1);
              else if (event.key === "ArrowRight") focus(index + 1);
            }}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        ))}
      </div>
      <small className="hint">{t("guest.codeHint", { total: CODE_LENGTH })}</small>
    </div>
  );
}
