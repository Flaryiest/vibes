import { useState } from "react";
import type { Throat } from "../../store/db";
import { buttonClass, headlineClass, quietButtonClass } from "../lab/styles";

const THROATS: { value: Throat; label: string }[] = [
  { value: "fine", label: "Fine" },
  { value: "tired", label: "Tired" },
  { value: "hoarse", label: "Hoarse" },
];

const choiceClass = (selected: boolean) => (selected ? "font-medium text-chalk underline underline-offset-4" : quietButtonClass);

/** Two taps after a session. The app cannot hear strain, so it asks. */
export function CheckIn({ onSave }: { onSave: (effort: number | null, throat: Throat | null) => void }) {
  const [throat, setThroat] = useState<Throat | null>(null);
  const [effort, setEffort] = useState<number | null>(null);

  return (
    <div className="pt-12">
      <p className={headlineClass}>How does your throat feel?</p>
      <div role="group" aria-label="Throat" className="mt-6 flex gap-7">
        {THROATS.map((option) => (
          <button
            key={option.value}
            onClick={() => setThroat(option.value)}
            aria-pressed={throat === option.value}
            className={choiceClass(throat === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {throat === "hoarse" && (
        <p className="mt-4 max-w-prose text-sm text-signal">
          Rest your voice. Tomorrow's session will be gentle humming only.
        </p>
      )}
      <p className="mt-10 text-mist">How hard did that feel, from 1 (easy) to 5 (a strain)?</p>
      <div role="group" aria-label="Effort" className="mt-4 flex gap-7 tabular-nums">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            onClick={() => setEffort(value)}
            aria-pressed={effort === value}
            aria-label={`Effort ${value}`}
            className={choiceClass(effort === value)}
          >
            {value}
          </button>
        ))}
      </div>
      <button onClick={() => onSave(effort, throat)} className={`mt-10 ${buttonClass}`}>
        Save and finish
      </button>
    </div>
  );
}
