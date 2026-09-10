"use client";
import { useState, useEffect, useCallback } from "react";
import { MICRO_CREDIT, LOW_BALANCE_THRESHOLD } from "@ai-platform/config";

interface BalanceState {
  microCredits:   number;
  displayCredits: number;
  isLow:          boolean;
  isZero:         boolean;
  loading:        boolean;
}

export function useBalance(pollIntervalMs = 30_000): BalanceState & { refresh: () => void } {
  const [state, setState] = useState<BalanceState>({
    microCredits:   0,
    displayCredits: 0,
    isLow:          false,
    isZero:         true,
    loading:        true,
  });

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/balance");
      if (!res.ok) {
        setState(s => ({ ...s, loading: false }));
        return;
      }
      const data = await res.json() as { credits: number };
      const mc   = typeof data.credits === "number" ? data.credits : 0;
      setState({
        microCredits:   mc,
        displayCredits: mc / MICRO_CREDIT,
        isLow:          mc > 0 && mc < LOW_BALANCE_THRESHOLD,
        isZero:         mc <= 0,
        loading:        false,
      });
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetch_, pollIntervalMs]);

  return { ...state, refresh: fetch_ };
}
