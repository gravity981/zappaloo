import type { ReactNode } from "react";
import { HEX } from "./model.ts";

/** A colour picker and a `#rrggbb` field for one colour (THM-09). */
export function ColorField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = HEX.test(props.value);
  return (
    <div className="color-row">
      <input
        type="color"
        aria-label={`${props.label} (picker)`}
        value={valid ? props.value.toLowerCase() : "#000000"}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      <div className="grow">
        <b className="sm">{props.label}</b>
        {props.hint === undefined ? null : <span className="hint"> {props.hint}</span>}
      </div>
      <input
        className="input"
        aria-label={`${props.label} (#rrggbb)`}
        aria-invalid={!valid}
        value={props.value}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => {
          props.onChange(event.target.value.trim());
        }}
      />
    </div>
  );
}

export function Switch(props: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      className={`switch${props.on ? " on" : ""}`}
      onClick={() => {
        props.onChange(!props.on);
      }}
    />
  );
}

export function Card(props: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="card" aria-labelledby={props.id}>
      <b id={props.id} className="h2">
        {props.title}
      </b>
      {props.children}
    </section>
  );
}
