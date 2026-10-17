from datetime import datetime

from pydantic import BaseModel, ConfigDict


class VersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    student_id: str
    group_id: str | None
    file_url: str
    description: str
    uploaded_at: datetime
