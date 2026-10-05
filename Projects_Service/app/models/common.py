"""Tipos compartidos por los modelos de MongoDB de este servicio."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator

# `_id` se guarda como ObjectId en Mongo y se expone como string (convención del template).
ObjectIdStr = Annotated[str, BeforeValidator(str)]


def _as_utc(value: datetime) -> datetime:
    # Motor devuelve fechas naive (ya en UTC); se marcan como UTC para serializarlas con zona.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


UTCDatetime = Annotated[datetime, AfterValidator(_as_utc)]


def utc_now() -> datetime:
    """Hora actual en UTC truncada a milisegundos, la precisión con la que Mongo guarda fechas.

    Así la respuesta de un POST coincide con lo que devuelve después un GET del mismo recurso.
    """
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)
