import { BrowserRouter, Route, Routes } from "react-router";
import { isChromium } from "./browser";
import { EngineProvider } from "./engine";
import { Lab } from "./Lab";
import { PhrasePractice } from "./PhrasePractice";
import { headlineClass } from "./lab/styles";
import { Practice } from "./Practice";
import { Range } from "./Range";
import { Session } from "./Session";
import { Shell } from "./Shell";
import { Song } from "./Song";
import { Songs } from "./Songs";
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
            <Route path="session" element={<Session />} />
            <Route path="practice" element={<Practice />} />
            <Route path="songs" element={<Songs />} />
            <Route path="songs/:id" element={<Song />} />
            <Route path="songs/:id/practice" element={<PhrasePractice />} />
            <Route path="range" element={<Range />} />
            <Route path="lab" element={<Lab />} />
          </Route>
        </Routes>
      </EngineProvider>
    </BrowserRouter>
  );
}
