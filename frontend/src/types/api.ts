/**
 * Tipos espejo de los schemas Pydantic del backend (sección 8.1 de la especificación).
 * Cada interfaz se llama igual que su schema, para buscar el mismo nombre en el microservicio.
 * Las fechas llegan como ISO 8601 UTC (string) y los ids como string.
 */

export type Role = "estudiante" | "docente";

/** Formato único de error de los cuatro servicios y del gateway. */
export interface ApiErrorBody {
  detail: string | Array<{ msg: string; loc?: Array<string | number> }>;
}

// ---- Auth Service (Auth_Service/app/schemas/user.py) ----

export interface UserRegisterRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Aceptación de términos y autorización de tratamiento de datos (obligatoria). */
  accept_legal: boolean;
  /** Versión de los documentos legales aceptados; Auth Service la guarda como prueba. */
  legal_version: string;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

/** `GET /api/v1/users/batch`: solo datos de display (sin email). */
export interface UserPublicResponse {
  id: string;
  name: string;
  role: Role;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  /** Segundos hasta la expiración del JWT. */
  expires_in: number;
}

// ---- Projects Service (Projects_Service/app/schemas/*.py) ----

export interface CourseCreateRequest {
  name: string;
}

export interface CourseJoinRequest {
  course_code: string;
}

export interface CourseResponse {
  id: string;
  name: string;
  course_code: string;
  teacher_id: string;
}

/** "group": los estudiantes forman grupos y las versiones son del grupo. */
export type WorkMode = "individual" | "group";
/** En proyectos por grupos: una calificación final por integrante o una para todo el grupo. */
export type GradingMode = "individual" | "group";

export interface ProjectCreateRequest {
  title: string;
  description?: string;
  work_mode?: WorkMode;
  /** Solo por grupos: 2 a 10, mínimo ≤ máximo. */
  group_min_size?: number;
  group_max_size?: number;
  /** Solo por grupos: ISO 8601 con zona, futura. Hasta cuándo se pueden formar grupos. */
  group_deadline?: string;
  grading_mode?: GradingMode;
  /** true = se crea oculto (borrador): los estudiantes no lo ven hasta que se muestre. */
  hidden?: boolean;
}

/**
 * `PATCH /projects/{id}`: solo cambian los campos enviados. Modalidad, tamaño de los grupos y
 * calificación solo se pueden cambiar mientras el proyecto no tenga grupos ni versiones (409).
 */
export type ProjectUpdateRequest = Partial<ProjectCreateRequest>;

export interface ProjectResponse {
  id: string;
  course_id: string;
  title: string;
  description: string;
  created_by: string;
  created_at: string;
  work_mode: WorkMode;
  grading_mode: GradingMode;
  group_min_size: number | null;
  group_max_size: number | null;
  group_deadline: string | null;
  /** Oculto por el docente: los estudiantes no lo ven (el backend lo trata como inexistente). */
  hidden: boolean;
  updated_at: string | null;
}

export interface GroupCreateRequest {
  /** Opcional: sin nombre, el grupo se llama "Grupo N". */
  name?: string;
}

export interface GroupResponse {
  id: string;
  project_id: string;
  name: string;
  member_ids: string[];
  created_at: string;
}

export interface GroupDeadlineRequest {
  group_deadline: string;
}

export interface VersionResponse {
  id: string;
  project_id: string;
  /** Quien subió la versión (en proyectos por grupos, el integrante que la subió). */
  student_id: string;
  /** Grupo dueño de la versión en proyectos por grupos; `null` en individuales. */
  group_id: string | null;
  /** URL interna de Blob Storage: no se abre desde el navegador; usar el endpoint `/file`. */
  file_url: string;
  description: string;
  uploaded_at: string;
}

export interface ProgressStats {
  versions_count: number;
  versions_with_feedback: number;
  progress_percentage: number;
}

/** Vista del estudiante en `GET /courses/{id}/progress`. */
export interface StudentProgressResponse extends ProgressStats {
  course_id: string;
  student_id: string;
}

export interface StudentProgressItem extends ProgressStats {
  student_id: string;
  /** `null` si Auth Service no respondió (degradación). */
  student_name: string | null;
}

/** Vista del docente titular en `GET /courses/{id}/progress`. */
export interface CourseProgressResponse extends ProgressStats {
  course_id: string;
  students: StudentProgressItem[];
}

export type ProgressResponse = StudentProgressResponse | CourseProgressResponse;

// ---- Feedback Service (Feedback_Service/app/schemas/feedback.py) ----

export interface FeedbackCreateRequest {
  comment: string;
  /**
   * Opcional, 0.0 a 5.0. Una versión tiene una sola calificación parcial vigente: enviar una nota
   * cuando ya hay otra la reemplaza (la anterior queda con `score_replaced: true`).
   */
  score?: number;
}

export interface FinalGradeCreateRequest {
  version_id: string;
  comment: string;
  /** Obligatoria, 0.0 a 5.0. */
  score: number;
  /** Solo en proyectos por grupos con calificación individual: el integrante calificado. */
  student_id?: string;
}

export interface FeedbackResponse {
  id: string;
  version_id: string;
  project_id: string;
  /** Autor de la versión; en una calificación final, el estudiante calificado. */
  student_id: string;
  /** Grupo de la versión en proyectos por grupos. */
  group_id: string | null;
  teacher_id: string;
  comment: string;
  /** `null` en un comentario sin calificación. */
  score: number | null;
  /** La calificación parcial fue reemplazada por una posterior en la misma versión. */
  score_replaced: boolean;
  is_final: boolean;
  created_at: string;
}

// ---- Export Service (Export_Service/app/api/v1/portfolio.py) ----

/** Portafolio académico del estudiante: varios proyectos (de uno o varios cursos) en un PDF. */
export interface PortfolioExportRequest {
  project_ids: string[];
  include_feedback: boolean;
  include_grades: boolean;
  include_images: boolean;
}
