import { useEffect, useState } from "react";
import { hasLocalServer } from "../store/localServer";

/** Whether the local server is there. Null for the moment before the answer is in. */
export function useHasLocalServer(): boolean | null {
  const [answer, setAnswer] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void hasLocalServer().then((has) => {
      if (current) setAnswer(has);
    });
    return () => {
      current = false;
    };
  }, []);
  return answer;
}
