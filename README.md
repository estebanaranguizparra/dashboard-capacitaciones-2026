# Dashboard Capacitaciones 2026

Dashboard interactivo del estado de capacitaciones (Libro de Clases), con filtros,
KPIs y un plan de acción priorizado.

**Sitio publicado:** ver GitHub Pages en la configuración del repositorio.

## Contenido

- `index.html`, `assets/` — dashboard estático (HTML/CSS/JS, sin dependencias externas vía CDN: la librería de lectura de Excel, SheetJS, está vendorizada en `assets/vendor/`).
- `data/capacitaciones.json` — datos normalizados que consume el dashboard (alumnos, cursos, capacitaciones).
- `data/capacitaciones_long.csv` — mismos datos en formato largo (una fila por alumno-curso), para análisis en Excel/Sheets.
- `scripts/transform.py` — script CLI equivalente que genera los archivos de `data/` a partir del Excel original (alternativa a cargarlo desde el navegador, ver abajo).

## Cómo se calcula la prioridad

La prioridad de cada capacitación pendiente o en progreso se recalcula **en el navegador**,
con la fecha del día en que se visita el dashboard (no queda fija en el momento de la
generación de los datos):

- **Alta**: la fecha de término ya pasó.
- **Media**: vence en 15 días o menos (o no tiene fecha de término registrada).
- **Baja**: vence en más de 15 días.
- **Sin acción**: la capacitación ya está completada.

## Actualizar los datos

### Opción 1: cargar el Excel directamente en el dashboard (recomendado)

El dashboard tiene un botón **"Cargar archivo .xlsx"** arriba de los KPIs. Sirve para
previsualizar una exportación nueva del Libro de Clases sin instalar nada:

1. Descarga el Excel desde el sistema de origen (mismo formato, sin editar columnas).
2. Ábrelo en el dashboard con ese botón — el navegador lo procesa localmente (nunca se
   sube a ningún servidor) y todos los filtros, KPIs y gráficos se refrescan al instante.
3. **Importante:** esto solo actualiza lo que ves *en tu navegador*. El sitio publicado
   (lo que ve cualquier otra persona con el link) no cambia hasta que lo publiques:
   usa los botones **"Descargar capacitaciones.json"** y **"Descargar CSV completo"**
   que aparecen tras la carga, reemplaza esos dos archivos dentro de `data/` en este
   repositorio, y haz commit + push. GitHub Pages se actualiza solo un par de minutos
   después del push.

### Opción 2: línea de comandos

```bash
python3 scripts/transform.py <ruta_al_excel_nuevo>.xlsx data
```

Genera los mismos `data/capacitaciones.json` y `data/capacitaciones_long.csv` que la
opción 1, útil para automatizar la actualización (cron, CI, etc.) sin pasar por el
navegador. Luego confirma los cambios con git y haz push.

## Google Sheets

Existe una carpeta "Dashboard Capacitaciones 2026" en Google Drive con tres planillas
resumen (Resumen por Sucursal, Resumen por Curso, Top Prioridades) pensadas para
revisión ejecutiva rápida. El detalle completo vive en este repositorio
(`data/capacitaciones_long.csv`) y en el dashboard, ya que por su volumen
(27.000+ filas) no es práctico mantenerlo sincronizado fila a fila con Sheets.

## Aviso de privacidad

Este repositorio y el dashboard publicado son **públicos**: cualquier persona con el
link puede ver nombre completo y RUT de cada colaborador. Tenlo presente antes de
compartir el link ampliamente.
