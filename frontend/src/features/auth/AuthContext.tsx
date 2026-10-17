import { toApiError } from "@/lib/errors";
import { TOKEN_KEY, clearToken, getToken, onSessionExpired, setToken } from "@/lib/session";
import type { UserRegisterRequest, UserResponse } from "@/types/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authApi from "./api";

interface AuthContextValue {
  user: UserResponse | null;
  token: string | null;
  /** true mientras se revalida el token guardado. */
  isLoading: boolean;
  /** La revalidación falló por red o servidor (no por token inválido): el token se conserva. */
  sessionError: boolean;
  retrySession: () => void;
  /**
   * true si la sesión terminó porque el usuario la cerró (aquí o en otra pestaña): el login no
   * debe volver a la última página, que puede ser de otra cuenta. false si expiró (401).
   */
  signedOut: boolean;
  login: (email: string, password: string) => Promise<UserResponse>;
  register: (body: UserRegisterRequest) => Promise<UserResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => getToken() !== null);
  const [sessionError, setSessionError] = useState(false);
  // Cambia para volver a revalidar el token guardado (reintento o cambio desde otra pestaña).
  const [validation, setValidation] = useState(0);
  const [signedOut, setSignedOut] = useState(false);

  const endSession = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
    setSessionError(false);
    queryClient.clear();
  }, [queryClient]);

  // Revalidación del token guardado (sección 7.2). Solo un 401 cierra la sesión: si el gateway o
  // la red fallan (servicios reiniciando), el token sigue siendo válido y se ofrece reintentar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `validation` fuerza la revalidación.
  useEffect(() => {
    const stored = getToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setSessionError(false);
    authApi
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setTokenState(stored);
        setUser(me);
      })
      .catch((error) => {
        if (cancelled) return;
        if (toApiError(error).kind === "unauthorized") endSession();
        else setSessionError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endSession, validation]);

  const logout = useCallback(() => {
    setSignedOut(true);
    endSession();
  }, [endSession]);

  // El interceptor de Axios avisa cuando una petición con token responde 401.
  useEffect(() => onSessionExpired(endSession), [endSession]);

  // Otra pestaña cerró sesión o entró con otra cuenta: esta pestaña no debe seguir con la
  // identidad vieja en memoria y el token nuevo en el almacenamiento.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY && event.key !== null) return;
      setUser(null);
      setTokenState(null);
      setSignedOut(true);
      queryClient.clear();
      setValidation((n) => n + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authApi.login({ email, password });
    setToken(access_token);
    try {
      const me = await authApi.getMe();
      setTokenState(access_token);
      setUser(me);
      setSessionError(false);
      setSignedOut(false);
      return me;
    } catch (error) {
      clearToken();
      throw error;
    }
  }, []);

  const register = useCallback(
    async (body: UserRegisterRequest) => {
      // Auth Service no inicia sesión al registrar: se hace login con las mismas credenciales.
      await authApi.register(body);
      return login(body.email, body.password);
    },
    [login],
  );

  const retrySession = useCallback(() => setValidation((n) => n + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      sessionError,
      retrySession,
      signedOut,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, sessionError, retrySession, signedOut, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}

/** Usuario autenticado; solo para componentes bajo <ProtectedRoute>. */
export function useCurrentUser(): UserResponse {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser requiere una sesión activa (<ProtectedRoute>)");
  return user;
}
