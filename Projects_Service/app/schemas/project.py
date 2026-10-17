from datetime import UTC, datetime
from typing import Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.project import GradingMode, WorkMode

MIN_GROUP_SIZE = 2
MAX_GROUP_SIZE = 10


def _invalid(message: str) -> PydanticCustomError:
    # Sin el prefijo "Value error, " de ValueError: el frontend muestra el mensaje tal cual.
    return PydanticCustomError("group_settings", message)


class ProjectCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=5000)
    work_mode: WorkMode = "individual"
    group_min_size: int | None = Field(default=None, ge=MIN_GROUP_SIZE, le=MAX_GROUP_SIZE)
    group_max_size: int | None = Field(default=None, ge=MIN_GROUP_SIZE, le=MAX_GROUP_SIZE)
    group_deadline: AwareDatetime | None = None
    grading_mode: GradingMode = "individual"
    # true = se crea oculto (borrador): los estudiantes no lo ven hasta que el docente lo muestre.
    hidden: bool = False

    @model_validator(mode="after")
    def check_group_settings(self) -> Self:
        if self.work_mode == "individual":
            # La configuración de grupos no aplica: se descarta lo que haya llegado.
            self.group_min_size = self.group_max_size = self.group_deadline = None
            self.grading_mode = "individual"
            return self
        if self.group_min_size is None or self.group_max_size is None:
            raise _invalid("Un proyecto por grupos necesita el mínimo y el máximo de integrantes")
        if self.group_min_size > self.group_max_size:
            raise _invalid("El mínimo de integrantes no puede ser mayor que el máximo")
        if self.group_deadline is None:
            raise _invalid("Un proyecto por grupos necesita la fecha límite para formar grupos")
        if self.group_deadline <= datetime.now(UTC):
            raise _invalid("La fecha límite para formar grupos debe ser futura")
        return self


class ProjectUpdateRequest(BaseModel):
    """Edición parcial de un proyecto: solo cambian los campos enviados.

    Título, descripción, visibilidad y plazo de grupos se pueden cambiar siempre. La modalidad, el
    tamaño de los grupos y el modo de calificación, solo mientras el proyecto no tenga grupos ni
    versiones (lo verifica el endpoint, que conoce ese estado).
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    hidden: bool | None = None
    work_mode: WorkMode | None = None
    group_min_size: int | None = Field(default=None, ge=MIN_GROUP_SIZE, le=MAX_GROUP_SIZE)
    group_max_size: int | None = Field(default=None, ge=MIN_GROUP_SIZE, le=MAX_GROUP_SIZE)
    group_deadline: AwareDatetime | None = None
    grading_mode: GradingMode | None = None


class GroupDeadlineRequest(BaseModel):
    """El docente cambia el plazo para formar grupos (p. ej. lo amplía o lo cierra antes)."""

    group_deadline: AwareDatetime


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str
    created_by: str
    created_at: datetime
    work_mode: WorkMode
    grading_mode: GradingMode
    group_min_size: int | None
    group_max_size: int | None
    group_deadline: datetime | None
    hidden: bool
    updated_at: datetime | None
