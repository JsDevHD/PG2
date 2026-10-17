from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GroupCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Opcional: sin nombre, el grupo se llama "Grupo N".
    name: str | None = Field(default=None, min_length=1, max_length=60)


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    member_ids: list[str]
    created_at: datetime
