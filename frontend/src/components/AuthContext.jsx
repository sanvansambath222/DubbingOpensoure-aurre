import { useRef, useEffect, useState, createContext, useContext, useCallback } from "react";
import axios from "axios";
import { Spinner } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API } from "./constants";
import { Moon, Sun } from "@phosphor-icons/react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(sessionStorage.getItem("session_token"));
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes('session_id=')) { setLoading(false); return; }
    const savedToken = sessionStorage.getItem("session_token");
    if (!savedToken) { setLoading(false); return; }
    try {
      const response = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } });
      setUser(response.data);
      setToken(savedToken);
    } catch (err) {
      console.warn("Auth check failed:", err.message);
      sessionStorage.removeItem("session_token");
      setToken(null);
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);
  const login = (userData, sessionToken) => {
    setUser(userData); setToken(sessionToken);
    sessionStorage.setItem("session_token", sessionToken);
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.warn("Logout request failed:", err.message);
    }
    sessionStorage.removeItem("session_token"); setUser(null); setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, checkAuth, isDark, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const ThemeToggle = () => {
  const { isDark, toggleTheme } = useAuth();
  return (
    <button onClick={toggleTheme} data-testid="theme-toggle"
      className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${isDark ? 'bg-zinc-800 text-yellow-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
      {isDark ? <Sun className="w-4 h-4" weight="fill" /> : <Moon className="w-4 h-4" weight="fill" />}
    </button>
  );
};

export const AuthCallback = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasProcessed = useRef(false);
  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const processAuth = async () => {
      const params = new URLSearchParams(window.location.hash.replace("#", ""));
      const sessionId = params.get("session_id");
      if (!sessionId) { navigate("/"); return; }
      try {
        const response = await axios.post(`${API}/auth/session`, {}, { headers: { "X-Session-ID": sessionId } });
        login(response.data.user, response.data.session_token);
        toast.success("Welcome to HeyGenerAI!");
        navigate("/dashboard");
      } catch { toast.error("Authentication failed"); navigate("/"); }
    };
    processAuth();
  }, [navigate, login]);
  return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center"><Spinner className="w-12 h-12 text-zinc-700 animate-spin" weight="bold" /></div>;
};

export const ProtectedRoute = ({ children }) => {
  const { user, loading, isDark } = useAuth();
  if (loading) return <div className={`min-h-screen flex items-center justify-center ${isDark?'bg-zinc-950':'bg-zinc-50'}`}><Spinner className="w-12 h-12 text-zinc-700 animate-spin" /></div>;
  if (!user) return null;
  return children;
};
