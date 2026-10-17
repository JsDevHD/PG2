import { PublicShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConsentCheckbox } from "@/components/ui/consent-checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LegalLink } from "@/features/legal/LegalLink";
import { LEGAL_ROUTES, LEGAL_VERSION, RESPONSIBLE } from "@/features/legal/legalConfig";
import { toApiError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap, Palette } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { type RegisterForm, registerSchema } from "./schemas";

const roles: Array<{ value: Role; title: string; description: string; icon: typeof Palette }> = [
  {
    value: "estudiante",
    title: "Estudiante",
    description: "Subo versiones de mis proyectos",
    icon: Palette,
  },
  {
    value: "docente",
    title: "Docente",
    description: "Creo cursos y reviso entregas",
    icon: GraduationCap,
  },
];

/** RF-10 — autoregistro. El rol se fija aquí y no se puede cambiar después. */
export function RegisterPage() {
  const { user, register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle("Crear cuenta");

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const selectedRole = watch("role");

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
        accept_legal: values.acceptLegal,
        legal_version: LEGAL_VERSION,
      });
      navigate("/", { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.kind === "conflict") setError("email", { message: apiError.message });
      else setFormError(apiError.message);
    }
  });

  return (
    <PublicShell>
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
          <p className="text-sm text-muted">El rol que elijas queda asociado a tu cuenta.</p>
        </div>
        <Card>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium">
                  ¿Cómo vas a usar la plataforma?
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roles.map(({ value, title, description, icon: Icon }) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink",
                        selectedRole === value
                          ? value === "docente"
                            ? "border-teacher bg-teacher-soft/50"
                            : "border-student bg-student-soft/50"
                          : "border-border hover:border-ink/30",
                      )}
                    >
                      <input type="radio" value={value} className="sr-only" {...register("role")} />
                      <Icon
                        className={cn(
                          "mt-0.5 size-5 shrink-0",
                          value === "docente" ? "text-teacher" : "text-student",
                        )}
                        aria-hidden
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{title}</span>
                        <span className="text-xs text-muted">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.role && (
                  <p role="alert" className="text-sm text-danger-ink">
                    {errors.role.message}
                  </p>
                )}
              </fieldset>
              <Field label="Nombre completo" error={errors.name?.message}>
                <Input autoComplete="name" placeholder="Ana Díaz" {...register("name")} />
              </Field>
              <Field label="Correo institucional" error={errors.email?.message}>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@udi.edu.co"
                  {...register("email")}
                />
              </Field>
              <Field
                label="Contraseña"
                error={errors.password?.message}
                hint="Entre 8 y 72 caracteres."
              >
                <Input type="password" autoComplete="new-password" {...register("password")} />
              </Field>
              <ConsentCheckbox
                {...register("acceptLegal")}
                error={errors.acceptLegal?.message}
                label={
                  <>
                    Acepto los <LegalLink to={LEGAL_ROUTES.terms}>términos de uso</LegalLink> y
                    autorizo el tratamiento de mis datos personales según la{" "}
                    <LegalLink to={LEGAL_ROUTES.privacy}>
                      política de tratamiento de datos
                    </LegalLink>
                    .
                  </>
                }
                details={
                  <>
                    <strong className="font-semibold text-ink">Aviso de privacidad:</strong>{" "}
                    {RESPONSIBLE.name} usará tu nombre, correo, rol y el trabajo que subas solo para
                    el seguimiento académico de tus proyectos. Puedes conocer, actualizar,
                    rectificar o pedir la supresión de tus datos escribiendo a {RESPONSIBLE.email}{" "}
                    (Ley 1581 de 2012).
                  </>
                }
              />
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
                >
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
                Crear cuenta
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
