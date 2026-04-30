import { useEffect, useRef, useState } from "react";

export function useSessionTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = performance.now();
    const id = setInterval(() => {
      setElapsed(performance.now() - startRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  return { elapsed, startTime: startRef.current };
}
