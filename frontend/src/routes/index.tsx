import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { CourseDashboardRouter } from "@/features/courses/CourseDashboardRouter";
import { CourseOnboardingPage } from "@/features/courses/CourseOnboardingPage";
import { CreateProjectPage, EditProjectPage } from "@/features/courses/CreateProjectPage";
import { TeacherProgressPage } from "@/features/courses/TeacherProgressPage";
import { PortfolioPage } from "@/features/export/PortfolioPage";
import { CopyrightPage } from "@/features/legal/CopyrightPage";
import { PrivacyPolicyPage } from "@/features/legal/PrivacyPolicyPage";
import { TermsPage } from "@/features/legal/TermsPage";
import { LEGAL_ROUTES } from "@/features/legal/legalConfig";
import { GroupsPage } from "@/features/projects/GroupsPage";
import { UploadVersionPage } from "@/features/projects/UploadVersionPage";
import { VersionDetailPage } from "@/features/projects/VersionDetailPage";
import { VersionHistoryPage } from "@/features/projects/VersionHistoryPage";
import { NotFoundPage, UnauthorizedPage } from "@/pages/StatusPages";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRoute } from "./RoleRoute";
import { ScrollToTop } from "./ScrollToTop";

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Documentos legales: públicos, deben poder leerse antes de crear la cuenta. */}
        <Route path={LEGAL_ROUTES.privacy} element={<PrivacyPolicyPage />} />
        <Route path={LEGAL_ROUTES.terms} element={<TermsPage />} />
        <Route path={LEGAL_ROUTES.copyright} element={<CopyrightPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<CourseOnboardingPage />} />
            <Route path="/courses/:courseId" element={<CourseDashboardRouter />} />
            <Route
              path="/courses/:courseId/projects/:projectId/versions"
              element={<VersionHistoryPage />}
            />
            <Route
              path="/courses/:courseId/projects/:projectId/versions/:versionId"
              element={<VersionDetailPage />}
            />
            <Route path="/courses/:courseId/projects/:projectId/groups" element={<GroupsPage />} />

            {/* Solo el estudiante sube versiones (Projects Service exige rol estudiante). */}
            <Route element={<RoleRoute allow={["estudiante"]} />}>
              <Route
                path="/courses/:courseId/projects/:projectId/upload"
                element={<UploadVersionPage />}
              />
              <Route path="/portafolio" element={<PortfolioPage />} />
            </Route>

            <Route element={<RoleRoute allow={["docente"]} />}>
              <Route path="/courses/:courseId/projects/new" element={<CreateProjectPage />} />
              <Route
                path="/courses/:courseId/projects/:projectId/edit"
                element={<EditProjectPage />}
              />
              <Route path="/courses/:courseId/progress" element={<TeacherProgressPage />} />
            </Route>

            <Route path="/no-autorizado" element={<UnauthorizedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
