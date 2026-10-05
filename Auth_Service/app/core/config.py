"""Configuración del servicio, leída exclusivamente desde variables de entorno (o `.env`).

Cada microservicio extiende `Settings` agregando sus propios campos, sin modificar los
heredados. Ejemplo:

    class AuthSettings(Settings):
        bcrypt_rounds: int = 12
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str
    environment: str = "development"  # development | production
    mongodb_uri: str
    mongodb_db_name: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60  # RNF-01: expiración de 60 minutos
    cors_allowed_origins: list[str] = ["*"]  # restringir en producción
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    """Instancia única de `Settings`. También sirve como dependencia de FastAPI."""
    return Settings()
