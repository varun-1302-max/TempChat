import { createContext } from 'react';

export interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
