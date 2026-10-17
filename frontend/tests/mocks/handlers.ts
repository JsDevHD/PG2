import type { Role } from "@/types/api";
import { http, HttpResponse } from "msw";
import * as data from "./data";

export const API = "http://gateway.test";

/** Rol del usuario autenticado en los handlers; los tests lo cambian con `setRole`. */
let currentRole: Role = "estudiante";
export function setRole(role: Role) {
  currentRole = role;
}
const me = () => (currentRole === "docente" ? data.teacher : data.student);

const pdf = (filename: string) =>
  HttpResponse.arrayBuffer(new TextEncoder().encode("%PDF-1.4").buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });

/** Un handler por endpoint del backend, con las respuestas de ejemplo de `data.ts`. */
export const handlers = [
  // ---- Auth Service ----
  http.post(`${API}/api/v1/auth/login`, () =>
    HttpResponse.json({ access_token: "test-token", token_type: "bearer", expires_in: 3600 }),
  ),
  http.post(`${API}/api/v1/auth/register`, () => HttpResponse.json(me(), { status: 201 })),
  http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me())),
  http.get(`${API}/api/v1/users/batch`, () =>
    HttpResponse.json(
      [data.teacher, data.student, data.classmate].map(({ id, name, role }) => ({
        id,
        name,
        role,
      })),
    ),
  ),

  // ---- Projects Service ----
  http.get(`${API}/api/v1/courses`, () => HttpResponse.json([data.course])),
  http.post(`${API}/api/v1/courses`, () => HttpResponse.json(data.course, { status: 201 })),
  http.post(`${API}/api/v1/courses/join`, () => HttpResponse.json(data.course)),
  http.get(`${API}/api/v1/courses/:courseId/projects`, () => HttpResponse.json([data.project])),
  http.post(`${API}/api/v1/courses/:courseId/projects`, () =>
    HttpResponse.json(data.project, { status: 201 }),
  ),
  http.get(`${API}/api/v1/courses/:courseId/progress`, () =>
    HttpResponse.json(currentRole === "docente" ? data.teacherProgress : data.studentProgress),
  ),
  http.get(`${API}/api/v1/projects/:projectId/versions`, () => HttpResponse.json(data.versions)),
  http.post(`${API}/api/v1/projects/:projectId/versions`, () =>
    HttpResponse.json(data.versions[1], { status: 201 }),
  ),
  http.get(`${API}/api/v1/projects/:projectId/versions/:versionId`, ({ params }) =>
    HttpResponse.json(data.versions.find((v) => v.id === params.versionId) ?? data.versions[0]),
  ),
  http.get(`${API}/api/v1/projects/:projectId/versions/:versionId/file`, () =>
    HttpResponse.arrayBuffer(new Uint8Array([137, 80, 78, 71]).buffer, {
      headers: { "Content-Type": "image/png" },
    }),
  ),
  http.get(`${API}/api/v1/projects/:projectId/groups`, ({ params }) =>
    HttpResponse.json(params.projectId === data.groupProject.id ? data.groups : []),
  ),
  http.post(`${API}/api/v1/projects/:projectId/groups`, () =>
    HttpResponse.json(
      { ...data.groups[1], id: "g9", name: "Grupo 3", member_ids: [me().id] },
      { status: 201 },
    ),
  ),
  http.post(`${API}/api/v1/projects/:projectId/groups/:groupId/join`, ({ params }) => {
    const group = data.groups.find((g) => g.id === params.groupId) ?? data.groups[1];
    return HttpResponse.json({ ...group, member_ids: [...group.member_ids, me().id] });
  }),
  http.post(
    `${API}/api/v1/projects/:projectId/groups/:groupId/leave`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(`${API}/api/v1/projects/:projectId/group-deadline`, () =>
    HttpResponse.json(data.groupProject),
  ),
  http.patch(`${API}/api/v1/projects/:projectId`, async ({ request }) =>
    HttpResponse.json({ ...data.project, ...((await request.json()) as object) }),
  ),
  http.delete(`${API}/api/v1/projects/:projectId`, () => new HttpResponse(null, { status: 204 })),

  // ---- Feedback Service ----
  http.get(`${API}/api/v1/versions/:versionId/feedback`, ({ params }) =>
    HttpResponse.json(data.feedback.filter((f) => f.version_id === params.versionId)),
  ),
  http.post(`${API}/api/v1/versions/:versionId/feedback`, () =>
    HttpResponse.json(data.feedback[0], { status: 201 }),
  ),
  http.get(`${API}/api/v1/projects/:projectId/feedback`, () => HttpResponse.json(data.feedback)),
  http.get(`${API}/api/v1/projects/:projectId/final-grade`, () => HttpResponse.json([])),
  http.post(`${API}/api/v1/projects/:projectId/final-grade`, () =>
    HttpResponse.json([{ ...data.feedback[0], id: "f9", is_final: true }], { status: 201 }),
  ),

  // ---- Export Service ----
  http.get(`${API}/api/v1/projects/:projectId/export`, () =>
    pdf("portafolio_Rediseno_de_marca_Ana_Diaz.pdf"),
  ),
  http.post(`${API}/api/v1/portfolio/export`, () => pdf("portafolio_academico_Ana_Diaz.pdf")),
];
