"use client";

import { createContext, useContext } from "react";

export type AdminLayoutContextType = {
  isAdminAuthenticated: boolean;
  setIsAdminAuthenticated: (value: boolean) => void;
};

export const AdminLayoutContext = createContext<AdminLayoutContextType>({
  isAdminAuthenticated: false,
  setIsAdminAuthenticated: () => {},
});

export function useAdminLayout() {
  return useContext(AdminLayoutContext);
}

