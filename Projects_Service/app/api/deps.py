"""Punto único de importación de dependencias para los routers de negocio.

Uso: `from app.api.deps import CurrentUser, get_current_user, get_db`
"""

from app.core.security import CurrentUser, get_current_user
from app.db.mongodb import get_db

__all__ = ["CurrentUser", "get_current_user", "get_db"]
