from typing import Annotated

from pydantic import BeforeValidator

# Mongo entrega `_id` como ObjectId; dentro de la app y en la API siempre se maneja como string.
ObjectIdStr = Annotated[str, BeforeValidator(str)]
