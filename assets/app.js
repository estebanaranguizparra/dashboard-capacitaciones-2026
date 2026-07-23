const MEDIA_DIAS = 15;

const state = {
  raw: null,
  records: [],
  filtered: [],
};

const PRIORIDAD_ORDER = { Alta: 0, Media: 1, Baja: 2, "Sin acción": 3 };

function clasificarPrioridad(estado, fechaTerminoStr, hoy) {
  if (estado === "Completado") return "Sin acción";
  if (!fechaTerminoStr) return "Media";
  const ft = new Date(fechaTerminoStr + "T00:00:00");
  const dias = Math.round((ft - hoy) / 86400000);
  if (dias < 0) return "Alta";
  if (dias <= MEDIA_DIAS) return "Media";
  return "Baja";
}

function accionSugerida(prioridad, dias) {
  if (prioridad === "Alta") return `Vencido hace ${Math.abs(dias)} día(s): contactar de inmediato.`;
  if (prioridad === "Media") return dias === null ? "Sin fecha de término: verificar." : `Vence en ${dias} día(s): enviar recordatorio.`;
  if (prioridad === "Baja") return "En plazo: monitorear avance regular.";
  return "Capacitación completada.";
}

async function loadData() {
  const res = await fetch("data/capacitaciones.json");
  const data = await res.json();
  state.raw = data;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const records = [];
  for (const row of data.capacitaciones) {
    const [alumnoIdx, cursoIdx, fechaInicio, fechaTermino, estadoCurso, nota] = row;
    const alumno = data.alumnos[alumnoIdx];
    const curso = data.cursos[cursoIdx];
    const prioridad = clasificarPrioridad(estadoCurso, fechaTermino, hoy);
    const dias = fechaTermino ? Math.round((new Date(fechaTermino + "T00:00:00") - hoy) / 86400000) : null;
    records.push({
      id: alumno.id,
      nombre: alumno.nombre,
      estadoEmpleado: alumno.estado_empleado,
      fechaIngreso: alumno.fecha_ingreso || "",
      seccion: alumno.seccion,
      sucursal: alumno.sucursal,
      curso,
      fechaInicio,
      fechaTermino,
      estadoCurso,
      nota,
      prioridad,
      dias,
    });
  }
  state.records = records;
}

// --- Carga de un Libro de Clases (.xlsx) directamente en el navegador ---
// Mismo formato ancho que el export original: columnas 1-6 son datos del
// alumno, luego bloques repetidos de 5 columnas (Curso, Fecha Inicio,
// Fecha Término, Estado, Nota) — uno por capacitación asignada. Espeja la
// logica de scripts/transform.py para producir el mismo shape de "records"
// que loadData(), asi el resto del dashboard no distingue el origen de los datos.

function excelDateToISO(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseWorkbookRecords(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  if (!rows.length || String(rows[0][0]).trim() !== "Id Alumno") {
    throw new Error(
      "El archivo no tiene el formato esperado (se esperaba 'Id Alumno' en la primera columna de la primera fila)."
    );
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const idAlumno = row[0];
    if (idAlumno === "" || idAlumno === undefined || idAlumno === null) continue;
    const nombre = row[1];
    const estadoEmpleado = row[2];
    const fechaIngreso = excelDateToISO(row[3]);
    const seccion = row[4];
    const sucursal = row[5];

    for (let base = 6; base < row.length; base += 5) {
      const curso = row[base];
      if (curso === "" || curso === undefined || curso === null) continue;
      const fechaInicio = excelDateToISO(row[base + 1]);
      const fechaTermino = excelDateToISO(row[base + 2]);
      const estadoCurso = row[base + 3] || "Pendiente";
      const notaRaw = row[base + 4];
      const nota = notaRaw === "" || notaRaw === undefined || notaRaw === null ? "" : notaRaw;
      const prioridad = clasificarPrioridad(estadoCurso, fechaTermino, hoy);
      const dias = fechaTermino ? Math.round((new Date(fechaTermino + "T00:00:00") - hoy) / 86400000) : null;

      records.push({
        id: String(idAlumno).trim(),
        nombre,
        estadoEmpleado,
        fechaIngreso,
        seccion,
        sucursal,
        curso,
        fechaInicio,
        fechaTermino,
        estadoCurso,
        nota,
        prioridad,
        dias,
      });
    }
  }
  return records;
}

// Rebuilds the same normalized {alumnos, cursos, capacitaciones} shape as
// data/capacitaciones.json, so the downloaded file can directly replace it.
function buildExportData(records) {
  const alumnoIndex = new Map();
  const alumnos = [];
  const cursoIndex = new Map();
  const cursos = [];
  const capacitaciones = [];

  for (const r of records) {
    if (!alumnoIndex.has(r.id)) {
      alumnoIndex.set(r.id, alumnos.length);
      alumnos.push({
        id: r.id,
        nombre: r.nombre,
        estado_empleado: r.estadoEmpleado,
        fecha_ingreso: r.fechaIngreso || "",
        seccion: r.seccion,
        sucursal: r.sucursal,
      });
    }
    if (!cursoIndex.has(r.curso)) {
      cursoIndex.set(r.curso, cursos.length);
      cursos.push(r.curso);
    }
    capacitaciones.push([alumnoIndex.get(r.id), cursoIndex.get(r.curso), r.fechaInicio, r.fechaTermino, r.estadoCurso, r.nota]);
  }

  return {
    generado: new Date().toISOString().slice(0, 10),
    columnas_capacitacion: ["alumno_idx", "curso_idx", "fecha_inicio", "fecha_termino", "estado_curso", "nota"],
    alumnos,
    cursos,
    capacitaciones,
  };
}

function buildExportCsv(records) {
  const header = ["id_alumno", "nombre_alumno", "estado_empleado", "fecha_ingreso", "seccion", "sucursal", "curso", "fecha_inicio", "fecha_termino", "estado_curso", "nota", "prioridad", "accion_sugerida"];
  const lines = [header.join(",")];
  for (const r of records) {
    const accion = accionSugerida(r.prioridad, r.dias);
    const vals = [r.id, r.nombre, r.estadoEmpleado, r.fechaIngreso, r.seccion, r.sucursal, r.curso, r.fechaInicio, r.fechaTermino, r.estadoCurso, r.nota, r.prioridad, accion]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setUploadStatus(html) {
  document.getElementById("upload-status").innerHTML = html;
}

async function handleFileUpload(file) {
  const btnUpload = document.getElementById("btn-upload");
  btnUpload.disabled = true;
  btnUpload.textContent = "Procesando…";
  setUploadStatus('<div class="banner">Leyendo y procesando el archivo, puede tardar unos segundos…</div>');

  try {
    // Yields a frame so the "Procesando…" message paints before the
    // (synchronous, potentially multi-second) parse of a ~2400-column sheet.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const records = parseWorkbookRecords(workbook);
    if (!records.length) throw new Error("No se encontraron registros de capacitaciones en el archivo.");

    state.records = records;
    state.raw = { generado: new Date().toISOString().slice(0, 10), localUpload: true };

    ["f-sucursal", "f-seccion", "f-curso", "f-estado", "f-prioridad"].forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("f-search").value = "";
    populateFilters();
    applyFilters();

    const alumnos = new Set(records.map((r) => r.id)).size;
    const fecha = new Date().toLocaleString("es-CL");
    document.getElementById("fuente-datos").innerHTML =
      `<b>Vista local sin publicar</b> · cargada el ${fecha} desde "${escapeHtml(file.name)}"`;
    setUploadStatus(`
      <div class="banner">
        <span>✅ <strong>${alumnos.toLocaleString("es-CL")}</strong> colaboradores y <strong>${records.length.toLocaleString("es-CL")}</strong> capacitaciones cargados desde "${escapeHtml(file.name)}".
        Esta vista solo se actualizó en <b>tu navegador</b> — para publicarla para todos, descarga el archivo de abajo, reemplaza <code>data/capacitaciones.json</code> en el repositorio y haz commit + push.</span>
      </div>
    `);
    document.getElementById("btn-download-json").hidden = false;
    document.getElementById("btn-download-csv").hidden = false;
  } catch (err) {
    setUploadStatus(`<div class="banner error">✕ No se pudo procesar el archivo: ${escapeHtml(err.message)}</div>`);
  } finally {
    btnUpload.disabled = false;
    btnUpload.textContent = "Cargar archivo .xlsx";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr.filter((v) => v))).sort((a, b) => a.localeCompare(b, "es"));
}

function populateFilters() {
  const sucursales = uniqueSorted(state.records.map((r) => r.sucursal));
  const secciones = uniqueSorted(state.records.map((r) => r.seccion));
  const cursos = uniqueSorted(state.records.map((r) => r.curso));

  fillSelect("f-sucursal", sucursales);
  fillSelect("f-seccion", secciones);
  fillSelect("f-curso", cursos);
}

function fillSelect(id, options) {
  const el = document.getElementById(id);
  while (el.options.length > 1) el.remove(1); // keep the "Todas/Todos" default, drop the rest
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    el.appendChild(o);
  }
}

function getFilterValues() {
  return {
    sucursal: document.getElementById("f-sucursal").value,
    seccion: document.getElementById("f-seccion").value,
    curso: document.getElementById("f-curso").value,
    estado: document.getElementById("f-estado").value,
    prioridad: document.getElementById("f-prioridad").value,
    q: document.getElementById("f-search").value.trim().toLowerCase(),
  };
}

function matchesFilters(r, f, excludeKeys) {
  const skip = excludeKeys || [];
  if (!skip.includes("sucursal") && f.sucursal && r.sucursal !== f.sucursal) return false;
  if (!skip.includes("seccion") && f.seccion && r.seccion !== f.seccion) return false;
  if (!skip.includes("curso") && f.curso && r.curso !== f.curso) return false;
  if (!skip.includes("estado") && f.estado && r.estadoCurso !== f.estado) return false;
  if (!skip.includes("prioridad") && f.prioridad && r.prioridad !== f.prioridad) return false;
  if (f.q) {
    const hay = (r.nombre || "").toLowerCase().includes(f.q) || (r.id || "").toLowerCase().includes(f.q);
    if (!hay) return false;
  }
  return true;
}

// Toggles a filter value from a chart click: clicking the already-selected
// bar clears the filter instead of re-applying it, so selection acts as a switch.
function toggleFilterAndApply(selectId, value) {
  const el = document.getElementById(selectId);
  el.value = el.value === value ? "" : value;
  applyFilters();
}

function applyFilters() {
  const f = getFilterValues();
  state.filtered = state.records.filter((r) => matchesFilters(r, f));

  renderActiveFilters(f);
  renderKPIs();
  renderChartSucursal(f);
  renderChartEstado(f);
  renderChartPrioridad(f);
  renderChartCursosPendientes(f);
  renderCollabChart(f);
}

function renderActiveFilters(f) {
  const parts = [];
  if (f.sucursal) parts.push(`Sucursal: ${f.sucursal}`);
  if (f.seccion) parts.push(`Sección: ${f.seccion}`);
  if (f.curso) parts.push(`Curso: ${f.curso}`);
  if (f.estado) parts.push(`Estado: ${f.estado}`);
  if (f.prioridad) parts.push(`Prioridad: ${f.prioridad}`);
  if (f.q) parts.push(`Búsqueda: "${f.q}"`);
  const el = document.getElementById("active-filters");
  el.textContent = parts.length
    ? `Filtros activos — ${parts.join(" · ")} (${state.filtered.length.toLocaleString("es-CL")} registros)`
    : `Sin filtros — mostrando ${state.filtered.length.toLocaleString("es-CL")} registros de ${state.records.length.toLocaleString("es-CL")} totales`;
}

function renderKPIs() {
  const rows = state.filtered;
  const alumnos = new Set(rows.map((r) => r.id)).size;
  const total = rows.length;
  const completadas = rows.filter((r) => r.estadoCurso === "Completado").length;
  const tasa = total ? ((completadas / total) * 100).toFixed(1) : "0.0";
  const alta = rows.filter((r) => r.prioridad === "Alta").length;
  const media = rows.filter((r) => r.prioridad === "Media").length;

  document.getElementById("kpi-alumnos").textContent = alumnos.toLocaleString("es-CL");
  document.getElementById("kpi-total").textContent = total.toLocaleString("es-CL");
  document.getElementById("kpi-tasa").textContent = `${tasa}%`;
  document.getElementById("kpi-alta").textContent = alta.toLocaleString("es-CL");
  document.getElementById("kpi-media").textContent = media.toLocaleString("es-CL");
}

function renderChartSucursal(f) {
  // Ignores its own "sucursal" filter so the chart still shows a comparison
  // across branches even while one is selected — the click IS the filter.
  const rows = state.records.filter((r) => matchesFilters(r, f, ["sucursal"]));
  const bySucursal = new Map();
  for (const r of rows) {
    if (!r.sucursal) continue;
    if (!bySucursal.has(r.sucursal)) bySucursal.set(r.sucursal, { total: 0, comp: 0 });
    const s = bySucursal.get(r.sucursal);
    s.total += 1;
    if (r.estadoCurso === "Completado") s.comp += 1;
  }
  let entries = Array.from(bySucursal.entries())
    .filter(([, s]) => s.total >= 5)
    .map(([sucursal, s]) => ({ sucursal, tasa: (s.comp / s.total) * 100, total: s.total }));
  entries.sort((a, b) => a.tasa - b.tasa);
  entries = entries.slice(0, 12);

  const container = document.getElementById("chart-sucursal");
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Sin datos suficientes para este filtro (mínimo 5 capacitaciones por sucursal).</div>';
    return;
  }
  for (const e of entries) {
    const row = document.createElement("div");
    const isSelected = f.sucursal === e.sucursal;
    row.className = "hbar-row" + (isSelected ? " selected" : "");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-pressed", String(isSelected));
    const safeName = escapeHtml(e.sucursal);
    row.title = `${safeName} — clic para ${isSelected ? "quitar" : "aplicar"} como filtro`;
    row.innerHTML = `
      <div class="name">${safeName}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(e.tasa, 2)}%"></div></div>
      <div class="pct">${e.tasa.toFixed(0)}%</div>
    `;
    const activate = () => toggleFilterAndApply("f-sucursal", e.sucursal);
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate();
      }
    });
    container.appendChild(row);
  }
}

function renderChartCursosPendientes(f) {
  const titleEl = document.getElementById("cursos-pend-title");
  titleEl.textContent = f.sucursal ? `Top 10 cursos pendientes en ${f.sucursal}` : "Top 10 cursos pendientes (global)";

  // Excludes its own "curso" filter (so it keeps comparing across courses)
  // and "estado" (this chart's metric IS the Pendiente count, independent
  // of whichever estado bar the user has selected elsewhere). Respects the
  // sucursal filter on purpose — that's what switches global vs. por-sucursal.
  const rows = state.records.filter((r) => matchesFilters(r, f, ["curso", "estado"]));
  const byCurso = new Map();
  for (const r of rows) {
    if (r.estadoCurso !== "Pendiente") continue;
    byCurso.set(r.curso, (byCurso.get(r.curso) || 0) + 1);
  }
  let entries = Array.from(byCurso.entries()).map(([curso, count]) => ({ curso, count }));
  entries.sort((a, b) => b.count - a.count);
  entries = entries.slice(0, 10);

  const container = document.getElementById("chart-cursos-pendientes");
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No hay cursos pendientes para este filtro.</div>';
    return;
  }
  const max = entries[0].count;
  for (const e of entries) {
    const row = document.createElement("div");
    const isSelected = f.curso === e.curso;
    row.className = "hbar-row" + (isSelected ? " selected" : "");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-pressed", String(isSelected));
    const safeName = escapeHtml(e.curso);
    row.title = `${safeName} — ${e.count} pendientes · clic para ${isSelected ? "quitar" : "aplicar"} como filtro`;
    row.innerHTML = `
      <div class="name">${safeName}</div>
      <div class="hbar-track"><div class="hbar-fill pend" style="width:${Math.max((e.count / max) * 100, 2)}%"></div></div>
      <div class="pct">${e.count.toLocaleString("es-CL")}</div>
    `;
    const activate = () => toggleFilterAndApply("f-curso", e.curso);
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate();
      }
    });
    container.appendChild(row);
  }
}

function renderChartEstado(f) {
  // Ignores its own "estado" filter for the same reason as renderChartSucursal.
  const rows = state.records.filter((r) => matchesFilters(r, f, ["estado"]));
  const counts = { Completado: 0, Pendiente: 0, "En progreso": 0 };
  for (const r of rows) {
    if (counts[r.estadoCurso] !== undefined) counts[r.estadoCurso] += 1;
  }
  const max = Math.max(1, ...Object.values(counts));
  const container = document.getElementById("chart-estado");
  container.innerHTML = "";
  const colors = { Completado: "var(--series-3)", Pendiente: "var(--series-2)", "En progreso": "var(--series-1)" };
  for (const [estado, val] of Object.entries(counts)) {
    const col = document.createElement("div");
    const isSelected = f.estado === estado;
    col.className = "estado-bar-col" + (isSelected ? " selected" : "");
    col.setAttribute("role", "button");
    col.setAttribute("tabindex", "0");
    col.setAttribute("aria-pressed", String(isSelected));
    col.title = `${estado} — clic para ${isSelected ? "quitar" : "aplicar"} como filtro`;
    const activate = () => toggleFilterAndApply("f-estado", estado);
    col.addEventListener("click", activate);
    col.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate();
      }
    });
    const h = Math.max((val / max) * 100, val > 0 ? 4 : 0);
    col.innerHTML = `
      <div class="val">${val.toLocaleString("es-CL")}</div>
      <div class="bar" style="height:${h}%; background:${colors[estado]}"></div>
      <div class="lbl">${estado}</div>
    `;
    container.appendChild(col);
  }
}

const PRIORIDAD_LABELS = ["Alta", "Media", "Baja", "Sin acción"];
// Status semantics, not an arbitrary category: Alta=critical, Media=warning,
// Baja=neutral (still on track), Sin acción=good (already completed).
const PRIORIDAD_COLORS = {
  Alta: "var(--critical)",
  Media: "var(--warning)",
  Baja: "var(--text-muted)",
  "Sin acción": "var(--good)",
};

function renderChartPrioridad(f) {
  // Ignores its own "prioridad" filter for the same cross-filtering reason
  // as the other two charts.
  const rows = state.records.filter((r) => matchesFilters(r, f, ["prioridad"]));
  const counts = { Alta: 0, Media: 0, Baja: 0, "Sin acción": 0 };
  for (const r of rows) {
    if (counts[r.prioridad] !== undefined) counts[r.prioridad] += 1;
  }
  const max = Math.max(1, ...Object.values(counts));
  const container = document.getElementById("chart-prioridad");
  container.innerHTML = "";
  for (const prioridad of PRIORIDAD_LABELS) {
    const val = counts[prioridad];
    const col = document.createElement("div");
    const isSelected = f.prioridad === prioridad;
    col.className = "estado-bar-col" + (isSelected ? " selected" : "");
    col.setAttribute("role", "button");
    col.setAttribute("tabindex", "0");
    col.setAttribute("aria-pressed", String(isSelected));
    col.title = `${prioridad} — clic para ${isSelected ? "quitar" : "aplicar"} como filtro`;
    const activate = () => toggleFilterAndApply("f-prioridad", prioridad);
    col.addEventListener("click", activate);
    col.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate();
      }
    });
    const h = Math.max((val / max) * 100, val > 0 ? 4 : 0);
    col.innerHTML = `
      <div class="val">${val.toLocaleString("es-CL")}</div>
      <div class="bar" style="height:${h}%; background:${PRIORIDAD_COLORS[prioridad]}"></div>
      <div class="lbl"><span class="lbl-dot" style="background:${PRIORIDAD_COLORS[prioridad]}"></span>${prioridad}</div>
    `;
    container.appendChild(col);
  }
}

// Drill-down: with no sucursal selected, bars aggregate by sucursal and are
// clickable to select one (same toggle pattern as the other charts). Once a
// sucursal is selected, the same component re-aggregates by colaborador
// within it — this is what the user actually asked to see.
function renderCollabChart(f) {
  const container = document.getElementById("collab-chart");
  const titleEl = document.getElementById("collab-title");
  const subEl = document.getElementById("collab-sub");
  const backBtn = document.getElementById("btn-collab-back");

  if (f.sucursal) {
    titleEl.textContent = `Colaboradores en ${f.sucursal}`;
    subEl.textContent = "Cursos completados, en progreso y pendientes por colaborador";
    backBtn.style.display = "inline-block";

    const byAlumno = new Map();
    for (const r of state.filtered) {
      if (!byAlumno.has(r.id)) byAlumno.set(r.id, { label: r.nombre, comp: 0, prog: 0, pend: 0 });
      const a = byAlumno.get(r.id);
      if (r.estadoCurso === "Completado") a.comp += 1;
      else if (r.estadoCurso === "En progreso") a.prog += 1;
      else a.pend += 1;
    }
    const entries = Array.from(byAlumno.values()).map((a) => ({ ...a, total: a.comp + a.prog + a.pend }));
    entries.sort((a, b) => (b.pend + b.prog) - (a.pend + a.prog) || b.total - a.total);
    renderStackedBars(container, entries, null);
  } else {
    titleEl.textContent = "Capacitaciones por sucursal";
    subEl.textContent = "Completadas, en progreso y pendientes · haz clic en una sucursal para ver sus colaboradores";
    backBtn.style.display = "none";

    // Excludes its own "sucursal" filter like the other sucursal-dimension chart.
    const rows = state.records.filter((r) => matchesFilters(r, f, ["sucursal"]));
    const bySucursal = new Map();
    for (const r of rows) {
      if (!r.sucursal) continue;
      if (!bySucursal.has(r.sucursal)) bySucursal.set(r.sucursal, { label: r.sucursal, comp: 0, prog: 0, pend: 0 });
      const s = bySucursal.get(r.sucursal);
      if (r.estadoCurso === "Completado") s.comp += 1;
      else if (r.estadoCurso === "En progreso") s.prog += 1;
      else s.pend += 1;
    }
    const entries = Array.from(bySucursal.values()).map((s) => ({ ...s, total: s.comp + s.prog + s.pend }));
    entries.sort((a, b) => (b.pend + b.prog) - (a.pend + a.prog) || b.total - a.total);
    renderStackedBars(container, entries, "f-sucursal");
  }
}

function renderStackedBars(container, entries, filterId) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No hay registros que coincidan con los filtros seleccionados.</div>';
    document.getElementById("collab-count").textContent = "";
    return;
  }
  const max = Math.max(1, ...entries.map((e) => e.total));
  const frag = document.createDocumentFragment();
  for (const e of entries) {
    const row = document.createElement("div");
    const clickable = Boolean(filterId);
    row.className = "stack-row" + (clickable ? " clickable" : "");
    const safeLabel = escapeHtml(e.label);
    const pct = (v) => (e.total ? (v / e.total) * 100 : 0);
    row.title = `${safeLabel} — ${e.comp} completadas, ${e.prog} en progreso, ${e.pend} pendientes`;
    row.innerHTML = `
      <div class="name">${safeLabel}</div>
      <div class="stack-track">
        <div class="stack-fill" style="width:${(e.total / max) * 100}%">
          <div class="seg comp" style="width:${pct(e.comp)}%"></div>
          <div class="seg prog" style="width:${pct(e.prog)}%"></div>
          <div class="seg pend" style="width:${pct(e.pend)}%"></div>
        </div>
      </div>
      <div class="total">${e.total}</div>
    `;
    if (clickable) {
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      const activate = () => toggleFilterAndApply(filterId, e.label);
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activate();
        }
      });
    }
    frag.appendChild(row);
  }
  container.appendChild(frag);
  document.getElementById("collab-count").textContent =
    `${entries.length.toLocaleString("es-CL")} ${entries.length === 1 ? "elemento" : "elementos"}`;
}

function exportCsv() {
  const sorted = [...state.filtered].sort((a, b) => {
    const pa = PRIORIDAD_ORDER[a.prioridad], pb = PRIORIDAD_ORDER[b.prioridad];
    if (pa !== pb) return pa - pb;
    return (a.fechaTermino || "9999").localeCompare(b.fechaTermino || "9999");
  });
  downloadFile("plan_de_accion_filtrado.csv", buildExportCsv(sorted), "text/csv;charset=utf-8;");
}

function wireEvents() {
  ["f-sucursal", "f-seccion", "f-curso", "f-estado", "f-prioridad"].forEach((id) => {
    document.getElementById(id).addEventListener("change", applyFilters);
  });
  document.getElementById("f-search").addEventListener("input", debounce(applyFilters, 200));
  document.getElementById("btn-clear").addEventListener("click", () => {
    ["f-sucursal", "f-seccion", "f-curso", "f-estado", "f-prioridad"].forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("f-search").value = "";
    applyFilters();
  });
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-collab-back").addEventListener("click", () => {
    document.getElementById("f-sucursal").value = "";
    applyFilters();
  });

  document.getElementById("btn-upload").addEventListener("click", () => {
    document.getElementById("file-upload").click();
  });
  document.getElementById("file-upload").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (file) handleFileUpload(file);
    ev.target.value = ""; // allow re-selecting the same file name later
  });
  document.getElementById("btn-download-json").addEventListener("click", () => {
    downloadFile("capacitaciones.json", JSON.stringify(buildExportData(state.records)), "application/json;charset=utf-8;");
  });
  document.getElementById("btn-download-csv").addEventListener("click", () => {
    downloadFile("capacitaciones_long.csv", buildExportCsv(state.records), "text/csv;charset=utf-8;");
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function init() {
  await loadData();
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("generado-fecha").textContent = state.raw.generado;
  populateFilters();
  wireEvents();
  applyFilters();
}

init();
