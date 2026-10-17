import { PublicShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { type LoginForm, loginSchema } from "./schemas";

/** Mockup 01_login.png — RF-01. */
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle("Iniciar sesión");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      // Auth Service responde el mismo 401 si el correo no existe o la contraseña es incorrecta.
      setFormError(errorMessage(error));
    }
  });

  return (
    <PublicShell>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
          <p className="text-sm text-muted">Entra para ver tus cursos y proyectos.</p>
        </div>
        <Card>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <Field label="Correo institucional" error={errors.email?.message}>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@udi.edu.co"
                  {...register("email")}
                />
              </Field>
              <Field label="Contraseña" error={errors.password?.message}>
                <Input type="password" autoComplete="current-password" {...register("password")} />
              </Field>
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
                >
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
                Iniciar sesión
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted">
          ¿Aún no tienes cuenta?{" "}
          <Link
            to="/register"
            className="font-semibold text-ink underline-offset-4 hover:underline"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
