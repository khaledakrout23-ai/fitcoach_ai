import { createContext, useContext } from 'react';

// Contextes partagés : utilisateur connecté et navigation entre écrans
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);
