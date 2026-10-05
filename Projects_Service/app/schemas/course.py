from pydantic import BaseModel, ConfigDict, Field


class CourseCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)


class CourseJoinRequest(BaseModel):
    # El código se genera en mayúsculas; se normaliza para tolerar lo que escriba el estudiante.
    model_config = ConfigDict(str_strip_whitespace=True, str_to_upper=True)

    course_code: str = Field(min_length=1, max_length=20)


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    course_code: str
    teacher_id: str
