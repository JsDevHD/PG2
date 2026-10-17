import type {
  CourseProgressResponse,
  CourseResponse,
  FeedbackResponse,
  GroupResponse,
  ProjectResponse,
  StudentProgressResponse,
  UserResponse,
  VersionResponse,
} from "@/types/api";

/** Respuestas de ejemplo con la forma exacta de los schemas del backend. */
export const teacher: UserResponse = {
  id: "t1",
  name: "Laura Méndez",
  email: "laura@udi.edu.co",
  role: "docente",
  created_at: "2026-09-01T12:00:00Z",
};

export const student: UserResponse = {
  id: "s1",
  name: "Ana Díaz",
  email: "ana@udi.edu.co",
  role: "estudiante",
  created_at: "2026-09-01T12:00:00Z",
};

export const course: CourseResponse = {
  id: "c1",
  name: "Diseño Gráfico III",
  course_code: "DG3X7Q",
  teacher_id: "t1",
};

export const project: ProjectResponse = {
  id: "p1",
  course_id: "c1",
  title: "Rediseño de marca",
  description: "Identidad visual para una marca local.",
  created_by: "t1",
  created_at: "2026-09-02T12:00:00Z",
  work_mode: "individual",
  grading_mode: "individual",
  group_min_size: null,
  group_max_size: null,
  group_deadline: null,
  hidden: false,
  updated_at: null,
};

/** Compañero de Ana en el grupo "Los Bauhaus". */
export const classmate: UserResponse = {
  id: "s2",
  name: "Bruno Gómez",
  email: "bruno@udi.edu.co",
  role: "estudiante",
  created_at: "2026-09-01T12:00:00Z",
};

/** Proyecto por grupos de 2 a 3, con calificación grupal y el plazo abierto. */
export const groupProject: ProjectResponse = {
  ...project,
  id: "p2",
  title: "Campaña en equipo",
  description: "Campaña gráfica para un evento cultural.",
  work_mode: "group",
  grading_mode: "group",
  group_min_size: 2,
  group_max_size: 3,
  group_deadline: "2099-12-31T23:59:00Z",
};

export const groups: GroupResponse[] = [
  {
    id: "g1",
    project_id: "p2",
    name: "Los Bauhaus",
    member_ids: ["s1", "s2"],
    created_at: "2026-09-05T12:00:00Z",
  },
  {
    id: "g2",
    project_id: "p2",
    name: "Grupo 2",
    member_ids: ["s3"],
    created_at: "2026-09-05T13:00:00Z",
  },
];

/** Versión del grupo "Los Bauhaus", subida por Bruno. */
export const groupVersion: VersionResponse = {
  id: "gv1",
  project_id: "p2",
  student_id: "s2",
  group_id: "g1",
  file_url:
    "http://azurite:10000/devstoreaccount1/versions/versions/p2/s2/0123456789abcdef0123456789abcdef_cartel.png",
  description: "Primera propuesta del grupo",
  uploaded_at: "2026-09-06T12:00:00Z",
};

export const versions: VersionResponse[] = [
  {
    id: "v1",
    project_id: "p1",
    student_id: "s1",
    group_id: null,
    file_url:
      "http://azurite:10000/devstoreaccount1/versions/versions/p1/s1/0123456789abcdef0123456789abcdef_boceto.png",
    description: "Boceto inicial",
    uploaded_at: "2026-09-03T12:00:00Z",
  },
  {
    id: "v2",
    project_id: "p1",
    student_id: "s1",
    group_id: null,
    file_url:
      "http://azurite:10000/devstoreaccount1/versions/versions/p1/s1/fedcba9876543210fedcba9876543210_logo.pdf",
    description: "Segunda propuesta de logo",
    uploaded_at: "2026-09-07T12:00:00Z",
  },
];

export const feedback: FeedbackResponse[] = [
  {
    id: "f1",
    version_id: "v1",
    project_id: "p1",
    student_id: "s1",
    group_id: null,
    teacher_id: "t1",
    comment: "Buena exploración inicial.",
    score: 3.84,
    score_replaced: false,
    is_final: false,
    created_at: "2026-09-04T12:00:00Z",
  },
];

export const studentProgress: StudentProgressResponse = {
  course_id: "c1",
  student_id: "s1",
  versions_count: 2,
  versions_with_feedback: 1,
  progress_percentage: 50,
};

export const teacherProgress: CourseProgressResponse = {
  course_id: "c1",
  versions_count: 2,
  versions_with_feedback: 1,
  progress_percentage: 50,
  students: [
    {
      student_id: "s1",
      student_name: "Ana Díaz",
      versions_count: 2,
      versions_with_feedback: 1,
      progress_percentage: 50,
    },
  ],
};
