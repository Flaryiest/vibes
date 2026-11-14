import { BrowserRouter, Route, Routes } from "react-router";
import { isChromium } from "./browser";
import { EngineProvider } from "./engine";
import { Lab } from "./Lab";
import { headlineClass } from "./lab/styles";
import { Practice } from "./Practice";
import { Range } from "./Range";
import { Shell } from "./Shell";
import { Today } from "./Today";

type BrandedNavigator = Navigator & { userAgentData?: { brands: { brand: string }[] } };

export function App() {
  const nav = navigator as BrandedNavigator;
  if (!isChromium(nav.userAgentData?.brands, nav.userAgent)) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 pt-[30vh] sm:px-10">
        <p className={headlineClass}>Open this in Google Chrome.</p>
        <p className="mt-3 max-w-lg text-mist">Safari and Firefox have audio bugs that break pitch scoring.</p>
      </main>
    );
  }
  return (
    <BrowserRouter>
      <EngineProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Today />} />
            <Route path="practice" element={<Practice />} />
            <Route path="range" element={<Range />} />
            <Route path="lab" element={<Lab />} />
          </Route>
        </Routes>
      </EngineProvider>
    </BrowserRouter>
  );
}
