// En desarrollo se usan las variables VITE_* de .env. En el contenedor, Nginx reemplaza este
// archivo al arrancar (docker/40-runtime-config.sh) con la URL del gateway del entorno.
window.__ENV__ = {};
