import { useCurrentUser } from "@/features/auth/AuthContext";
import { useParams } from "react-router-dom";
import { StudentDashboardPage } from "./StudentDashboardPage";
import { TeacherDashboardPage } from "./TeacherDashboardPage";

/** Una sola ruta `/courses/:courseId`; el rol del token decide qué panel se muestra. */
export function CourseDashboardRouter() {
  const user = useCurrentUser();
  const { courseId = "" } = useParams();
  return user.role === "docente" ? (
    <TeacherDashboardPage courseId={courseId} />
  ) : (
    <StudentDashboardPage courseId={courseId} />
  );
}
