# Dashboard Capacitaciones 2026

Dashboard interactivo del estado de capacitaciones (Libro de Clases), con filtros,
KPIs y un plan de acción priorizado.

**Sitio publicado:** ver GitHub Pages en la configuración del repositorio.

## Contenido

- `index.html`, `assets/` — dashboard estático (HTML/CSS/JS sin dependencias externas).
- `data/capacitaciones.json` — datos normalizados que consume el dashboard (alumnos, cursos, capacitaciones).
- `data/capacitaciones_long.csv` — mismos datos en formato largo (una fila por alumno-curso), para análisis en Excel/Sheets.
- `scripts/transform.py` — script que genera los archivos de `data/` a partir del Excel original ("Libro de Clases").

## Cómo se calcula la prioridad

La prioridad de cada capacitación pendiente o en progreso se recalcula **en el navegador**,
con la fecha del día en que se visita el dashboard (no queda fija en el momento de la
generación de los datos):

- **Alta**: la fecha de término ya pasó.
- **Media**: vence en 15 días o menos (o no tiene fecha de término registrada).
- **Baja**: vence en más de 15 días.
- **Sin acción**: la capacitación ya está completada.

## Actualizar los datos

Cuando haya una nueva exportación del Libro de Clases:

```bash
python3 scripts/transform.py <ruta_al_excel_nuevo>.xlsx data
```

Esto regenera `data/capacitaciones.json` y `data/capacitaciones_long.csv`. Luego
confirma los cambios con git y haz push — GitHub Pages se actualiza automáticamente.

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
