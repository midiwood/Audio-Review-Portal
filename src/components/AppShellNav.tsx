"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AppShellNav = {
  openNav: () => void;
};

const AppShellNavContext = createContext<AppShellNav | null>(null);

export function AppShellNavProvider({
  children,
  openNav,
}: {
  children: ReactNode;
  openNav: () => void;
}) {
  const value = useMemo(() => ({ openNav }), [openNav]);
  return <AppShellNavContext.Provider value={value}>{children}</AppShellNavContext.Provider>;
}

export function useAppShellNav() {
  return useContext(AppShellNavContext);
}

export function useOpenAppShellNav() {
  const ctx = useAppShellNav();
  return useCallback(() => {
    ctx?.openNav();
  }, [ctx]);
}
