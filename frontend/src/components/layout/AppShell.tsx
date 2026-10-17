import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { IterationShowcase } from "./IterationShowcase";
import { Colophon } from "./SiteFooter";
import { ThemeToggle } from "./ThemeToggle";

export const APP_NAME = config.appName;

const roleLabel = { docente: "Docente", estudiante: "Estudiante" } as const;

function Header({ children, start }: { children?: ReactNode; start?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-chrome text-white">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
        {start}
        <Link to="/" className="truncate text-base font-semibold tracking-tight sm:text-lg">
          {APP_NAME}
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {children}
        </div>
      </div>
    </header>
  );
}

/**
 * Estructura de las pantallas autenticadas: header, regla del color del rol y, debajo, la
 * navegación lateral junto al contenido, que se apoya sobre la "plancha de corte".
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = user?.role;

  // Cierre explícito: ProtectedRoute lleva a /login sin recordar la página (AuthContext.signedOut),
  // así el próximo login empieza en el inicio y no en la última página del otro usuario.
  const signOut = () => {
    setMenuOpen(false);
    logout();
  };

  // Al cambiar de página se cierra el menú del celular.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depende solo de la ruta.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <Header
          start={
            <DialogTrigger asChild>
              <button
                type="button"
                className="-ml-1 rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </button>
            </DialogTrigger>
          }
        >
          {user && role && (
            <>
              {/* Celular: el avatar también abre el menú. */}
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-white/10 lg:hidden"
                  aria-label={`${user.name}, ${roleLabel[role]}. Abrir menú`}
                >
                  <Avatar name={user.name} userRole={role} className="size-8" />
                </button>
              </DialogTrigger>
              {/* Escritorio: solo informativo (la cuenta está al pie de la barra lateral). */}
              <div className="hidden items-center gap-3 lg:flex">
                <div className="text-right">
                  <p className="text-sm font-medium leading-tight">{user.name}</p>
                  <p className="text-xs text-white/60">{roleLabel[role]}</p>
                </div>
                <Avatar name={user.name} userRole={role} className="size-8" />
              </div>
            </>
          )}
        </Header>
        <div
          className={cn("ruler sticky top-14 z-20", role === "docente" && "ruler-teacher")}
          aria-hidden
        />

        {user && (
          <SheetContent title="Menú">
            <div className="flex h-14 shrink-0 items-center bg-chrome px-4 pr-12 text-base font-semibold tracking-tight text-white">
              <span className="truncate">{APP_NAME}</span>
            </div>
            <div
              className={cn("ruler shrink-0", role === "docente" && "ruler-teacher")}
              aria-hidden
            />
            <AppSidebar onSignOut={signOut} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        )}
      </Dialog>

      <div className="flex flex-1">
        {user && (
          <aside className="sticky top-[66px] hidden h-[calc(100dvh-66px)] w-72 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
            <AppSidebar onSignOut={signOut} />
          </aside>
        )}
        <main
          id="contenido"
          className={cn(
            "mat flex min-w-0 flex-1 flex-col",
            role === "docente" ? "mat-teacher" : "mat-student",
          )}
        >
          {/* Los enlaces legales viven en la barra lateral (y en el menú del celular). */}
          <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Estructura de login y registro: formulario + ilustración del producto en pantallas grandes. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="grid flex-1 lg:grid-cols-2">
        <div className="mat flex items-start justify-center px-4 py-10 sm:items-center sm:py-16">
          {children}
        </div>
        <div className="hidden items-center justify-center border-l border-border bg-surface px-12 lg:flex">
          <IterationShowcase />
        </div>
      </main>
      <Colophon />
    </div>
  );
}

/** Estructura de las páginas legales: públicas, con o sin sesión. */
export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mat flex-1">{children}</main>
      <Colophon />
    </div>
  );
}
