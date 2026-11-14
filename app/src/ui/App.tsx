import { isChromium } from "./browser";

type BrandedNavigator = Navigator & { userAgentData?: { brands: { brand: string }[] } };

export function App() {
  const nav = navigator as BrandedNavigator;
  if (!isChromium(nav.userAgentData?.brands, nav.userAgent)) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-lg text-slate-100">
        This app needs Google Chrome. Safari and Firefox have audio bugs that break pitch scoring.
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold">Audio lab</h1>
    </main>
  );
}
