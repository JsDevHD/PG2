"""Configuración única del logging del servicio.

Cada módulo obtiene su propio logger con `logging.getLogger(__name__)`; aquí solo se
configura el logger raíz una vez, al arrancar la app.
"""

import logging

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def setup_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format=LOG_FORMAT)
