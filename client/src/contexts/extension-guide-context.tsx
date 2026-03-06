import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ExtensionGuideContextValue = {
  showExtensionGuide: boolean;
  openExtensionGuide: () => void;
  closeExtensionGuide: () => void;
};

const ExtensionGuideContext = createContext<ExtensionGuideContextValue | null>(null);

export function ExtensionGuideProvider({ children }: { children: ReactNode }) {
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);

  const openExtensionGuide = useCallback(() => {
    setShowExtensionGuide(true);
  }, []);

  const closeExtensionGuide = useCallback(() => {
    setShowExtensionGuide(false);
  }, []);

  return (
    <ExtensionGuideContext.Provider
      value={{ showExtensionGuide, openExtensionGuide, closeExtensionGuide }}
    >
      {children}
    </ExtensionGuideContext.Provider>
  );
}

export function useExtensionGuide(): ExtensionGuideContextValue {
  const ctx = useContext(ExtensionGuideContext);
  if (!ctx) {
    return {
      showExtensionGuide: false,
      openExtensionGuide: () => {},
      closeExtensionGuide: () => {},
    };
  }
  return ctx;
}
