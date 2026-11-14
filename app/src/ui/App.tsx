import { isChromium } from "./browser";
import { Lab } from "./Lab";

type BrandedNavigator = Navigator & { userAgentData?: { brands: { brand: string }[] } };

export function App() {
  const nav = navigator as BrandedNavigator;
  if (!isChromium(nav.userAgentData?.brands, nav.userAgent)) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 pt-[30vh] sm:px-10">
        <p className="max-w-lg text-3xl leading-tight [font-stretch:87%]">Open this in Google Chrome.</p>
        <p className="mt-3 max-w-lg text-mist">Safari and Firefox have audio bugs that break pitch scoring.</p>
      </main>
    );
  }
  return <Lab />;
}
