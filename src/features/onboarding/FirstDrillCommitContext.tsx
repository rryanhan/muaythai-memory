"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type FirstDrillCommitState = {
  committing: boolean;
  setCommitting: (committing: boolean) => void;
};

const FirstDrillCommitContext = createContext<FirstDrillCommitState>({
  committing: false,
  setCommitting: () => undefined,
});

export function FirstDrillCommitProvider({ children }: { children: ReactNode }) {
  const [committing, setCommitting] = useState(false);
  const value = useMemo(() => ({ committing, setCommitting }), [committing]);

  return (
    <FirstDrillCommitContext.Provider value={value}>
      {children}
    </FirstDrillCommitContext.Provider>
  );
}

export function useFirstDrillCommit() {
  return useContext(FirstDrillCommitContext);
}
