import { PageHeader, SectionTitle } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/layout/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useCurrentUser } from "@/features/auth/AuthContext";
import { toApiError } from "@/lib/errors";
import type { CourseResponse, Role } from "@/types/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useCourses, useCreateCourse, useJoinCourse } from "./hooks";

const createSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del curso").max(100, "Máximo 100 caracteres"),
});
const joinSchema = z.object({
  course_code: z
    .string()
    .trim()
    .min(1, "Escribe el código que te compartió el docente")
    .max(20, "Máximo 20 caracteres"),
});

function CreateCourseCard() {
  const navigate = useNavigate();
  const createCourse = useCreateCourse();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema) });

  const onSubmit = handleSubmit((values) =>
    createCourse.mutate(values, {
      onSuccess: (course) => {
        toast.success("Curso creado", {
          description: `Comparte el código ${course.course_code} con tus estudiantes.`,
        });
        navigate(`/courses/${course.id}`);
      },
      onError: (error) => setError("name", { message: toApiError(error).message }),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <Badge tone="teacher" className="w-fit">
          Docente
        </Badge>
        <CardTitle className="mt-2">Crear curso</CardTitle>
        <CardDescription>
          Se genera un código único para compartir con tus estudiantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nombre del curso" error={errors.name?.message}>
            <Input placeholder="Diseño Gráfico III" {...register("name")} />
          </Field>
          <Button type="submit" loading={createCourse.isPending}>
            Crear curso
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinCourseCard() {
  const navigate = useNavigate();
  const joinCourse = useJoinCourse();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof joinSchema>>({ resolver: zodResolver(joinSchema) });

  const onSubmit = handleSubmit((values) =>
    joinCourse.mutate(
      { course_code: values.course_code.toUpperCase() },
      {
        onSuccess: (course) => {
          toast.success(`Te uniste a ${course.name}`);
          navigate(`/courses/${course.id}`);
        },
        onError: (error) => setError("course_code", { message: toApiError(error).message }),
      },
    ),
  );

  return (
    <Card>
      <CardHeader>
        <Badge tone="student" className="w-fit">
          Estudiante
        </Badge>
        <CardTitle className="mt-2">Unirse a un curso</CardTitle>
        <CardDescription>El docente comparte este código al crear el curso.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Código de curso" error={errors.course_code?.message}>
            <Input
              placeholder="Ej. K7Q2XM"
              autoCapitalize="characters"
              className="uppercase"
              {...register("course_code")}
            />
          </Field>
          <Button type="submit" loading={joinCourse.isPending}>
            Unirme al curso
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CourseList({ courses, role }: { courses: CourseResponse[]; role: Role }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            to={`/courses/${course.id}`}
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-ink/30"
          >
            <span
              className={
                role === "docente"
                  ? "flex size-10 shrink-0 items-center justify-center rounded-lg bg-teacher-soft text-teacher-ink"
                  : "flex size-10 shrink-0 items-center justify-center rounded-lg bg-student-soft text-student-ink"
              }
            >
              <BookOpen className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{course.name}</span>
              <span className="block font-mono text-xs tracking-wider text-muted">
                {course.course_code}
              </span>
            </span>
            <ChevronRight
              className="size-5 text-muted transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Mockup 02_crear_unirse_curso.png — renderizado condicional por `user.role`. */
export function CourseOnboardingPage() {
  const user = useCurrentUser();
  const courses = useCourses();
  const isTeacher = user.role === "docente";
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        documentTitle="Mis cursos"
        context={
          isTeacher
            ? "Estos son los cursos que diriges."
            : "Estos son los cursos en los que estás inscrito."
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <section aria-labelledby="mis-cursos">
          <SectionTitle>
            <span id="mis-cursos">Mis cursos</span>
          </SectionTitle>
          {courses.isLoading && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-[74px]" />
              <Skeleton className="h-[74px]" />
            </div>
          )}
          {courses.isError && (
            <ErrorState error={courses.error} onRetry={() => courses.refetch()} />
          )}
          {courses.data?.length === 0 && (
            <EmptyState
              icon={BookOpen}
              title={isTeacher ? "Aún no tienes cursos" : "Aún no estás en ningún curso"}
              description={
                isTeacher
                  ? "Crea tu primer curso y comparte el código con tus estudiantes."
                  : "Pide el código del curso a tu docente y escríbelo en el formulario."
              }
            />
          )}
          {courses.data && courses.data.length > 0 && (
            <CourseList courses={courses.data} role={user.role} />
          )}
        </section>
        <aside>{isTeacher ? <CreateCourseCard /> : <JoinCourseCard />}</aside>
      </div>
    </>
  );
}
