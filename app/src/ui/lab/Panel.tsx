import type { ReactNode } from "react";

/** One section of the lab: a title in the left column, content on the right, a hairline above. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-rule py-8 md:grid-cols-[11rem_1fr]">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
