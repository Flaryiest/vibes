/** The main action on a screen: chalk on navy. Brass is reserved for the voice. */
export const buttonClass =
  "rounded-md bg-chalk px-3.5 py-1.5 text-sm font-medium text-deep transition-opacity hover:opacity-90 disabled:opacity-40";

/** A secondary action, set as a text link. */
export const quietButtonClass =
  "text-sm text-mist underline underline-offset-4 transition-colors hover:text-chalk disabled:opacity-40";

export const inputClass =
  "w-full rounded-md border border-rule bg-transparent px-2.5 py-1.5 text-sm text-chalk placeholder:text-mist/60";

/** The one large line of text that says what a screen is for or what to do now. */
export const headlineClass = "max-w-2xl text-4xl leading-tight [font-stretch:87%]";

export const tableClass = "w-full text-left text-sm tabular-nums";
export const headCellClass = "whitespace-nowrap pb-2 pr-6 font-normal text-mist";
export const cellClass = "whitespace-nowrap py-1 pr-6 align-top";
/** A cell whose text may wrap, for long labels. */
export const wrapCellClass = "py-1 pr-6 align-top";
export const noteClass = "max-w-prose text-sm text-mist";
