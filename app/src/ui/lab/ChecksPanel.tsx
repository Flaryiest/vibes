import { useState } from "react";
import { CHECKS, allDecided, exportResults, upsert, type CheckDef, type CheckResult } from "../../lab/checks";
import { Panel } from "./Panel";
import { download, loadJson, saveJson } from "./persist";
import { buttonClass, inputClass, quietButtonClass } from "./styles";

const KEY = "lab.checks";
const MACHINE = "MacBook Pro, Apple M4, macOS 26";

function CheckRow({
  check,
  saved,
  onSave,
}: {
  check: CheckDef;
  saved?: CheckResult;
  onSave: (result: CheckResult) => void;
}) {
  const [status, setStatus] = useState<CheckResult["status"]>(saved?.status ?? "pass");
  const [value, setValue] = useState(saved?.value ?? "");
  const [decision, setDecision] = useState(saved?.decision ?? "");
  const unchanged = saved && saved.status === status && saved.value === value && saved.decision === decision;

  return (
    <li className="space-y-2">
      <p className="text-sm">
        {check.id}. {check.title}
      </p>
      <p className="max-w-prose text-sm text-mist">
        Passes when: {check.pass.charAt(0).toLowerCase() + check.pass.slice(1)}. Otherwise:{" "}
        {check.ifFail.charAt(0).toLowerCase() + check.ifFail.slice(1)}.
      </p>
      <div className="grid gap-2 sm:grid-cols-[6.5rem_1fr_1fr_3.5rem] sm:items-center">
        <select
          aria-label={`Result of check ${check.id}`}
          value={status}
          onChange={(event) => setStatus(event.target.value as CheckResult["status"])}
          className={inputClass}
        >
          <option value="pass">Passed</option>
          <option value="fail">Failed</option>
        </select>
        <input
          aria-label={`What was measured for check ${check.id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="What was measured"
          className={inputClass}
        />
        <input
          aria-label={`Decision for check ${check.id}`}
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          placeholder="Decision"
          className={inputClass}
        />
        {unchanged ? (
          <span className="text-sm text-mist">Saved</span>
        ) : (
          <button
            onClick={() => onSave({ id: check.id, status, value, decision, at: new Date().toISOString() })}
            className={`text-left ${quietButtonClass}`}
          >
            Save
          </button>
        )}
      </div>
    </li>
  );
}

export function ChecksPanel() {
  const [results, setResults] = useState<CheckResult[]>(() => loadJson<CheckResult[]>(KEY, []));

  function save(result: CheckResult) {
    const next = upsert(results, result);
    saveJson(KEY, next);
    setResults(next);
  }

  return (
    <Panel title="Checks">
      <ol className="space-y-8">
        {CHECKS.map((check) => (
          <CheckRow key={check.id} check={check} saved={results.find((r) => r.id === check.id)} onSave={save} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-5 pt-4">
        <button
          onClick={() => download("audio-lab-results.json", exportResults(results, MACHINE), "application/json")}
          className={buttonClass}
        >
          Download results
        </button>
        <span className="text-sm text-mist">
          {allDecided(results) ? "Every check has a decision." : "Some checks still need a decision."}
        </span>
      </div>
    </Panel>
  );
}
