import React, { useState, useEffect } from 'react';
import { sounds } from '../services/sound';
import { ThemeContext } from './context';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('tempchat_dark_mode');
    if (saved !== null) {
      return saved === 'true';
    }
    return true; // Default dark
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => sounds.isEnabled());

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('tempchat_dark_mode', 'true');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('tempchat_dark_mode', 'false');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  const toggleSound = () => {
    const next = sounds.toggle();
    setSoundEnabled(next);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, soundEnabled, toggleSound }}>
      {children}
    </ThemeContext.Provider>
  );
};
