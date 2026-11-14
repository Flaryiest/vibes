import { newProgress, stateOf, type PhraseProgress, type PhraseState } from "../practice/phraseLadder";
import type { Phrase } from "../song/phrases";

const STYLE: Record<PhraseState, string> = {
  new: "border border-rule",
  learning: "bg-chalk/25",
  clean: "bg-chalk",
  solid: "bg-brass",
};

export function countStates(phrases: Phrase[], progress: PhraseProgress[], songId: string): Record<PhraseState, number> {
  const counts: Record<PhraseState, number> = { new: 0, learning: 0, clean: 0, solid: 0 };
  for (const phrase of phrases) {
    counts[stateOf(progress.find((p) => p.group === phrase.group) ?? newProgress(songId, phrase.group))]++;
  }
  return counts;
}

/** Every phrase of the song in order, as a row of marks: outlined (new), dim (learning), chalk (clean), brass (solid). */
export function MasteryMap({ phrases, progress, songId }: { phrases: Phrase[]; progress: PhraseProgress[]; songId: string }) {
  const counts = countStates(phrases, progress, songId);
  const summary = (["solid", "clean", "learning", "new"] as const)
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`)
    .join(", ");
  return (
    <div>
      <ol aria-label="Phrases" className="flex flex-wrap gap-1.5">
        {phrases.map((phrase) => {
          const state = stateOf(progress.find((p) => p.group === phrase.group) ?? newProgress(songId, phrase.group));
          return (
            <li key={phrase.index} title={`${phrase.text} (${state})`} className={`h-5 w-3 rounded-sm ${STYLE[state]}`}>
              <span className="sr-only">
                {phrase.text}: {state}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-mist">
        {phrases.length} {phrases.length === 1 ? "phrase" : "phrases"}: {summary}
      </p>
    </div>
  );
}
