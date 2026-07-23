const MEDIA_DIAS = 15;

const state = {
  raw: null,
  records: [],
  filtered: [],
  sortKey: "prioridad",
  sortDir: "asc",
  rowLimit: 300,
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
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    el.appendChild(o);
  }
}

function applyFilters() {
  const sucursal = document.getElementById("f-sucursal").value;
  const seccion = document.getElementById("f-seccion").value;
  const curso = document.getElementById("f-curso").value;
  const estado = document.getElementById("f-estado").value;
  const prioridad = document.getElementById("f-prioridad").value;
  const q = document.getElementById("f-search").value.trim().toLowerCase();

  state.filtered = state.records.filter((r) => {
    if (sucursal && r.sucursal !== sucursal) return false;
    if (seccion && r.seccion !== seccion) return false;
    if (curso && r.curso !== curso) return false;
    if (estado && r.estadoCurso !== estado) return false;
    if (prioridad && r.prioridad !== prioridad) return false;
    if (q) {
      const hay = (r.nombre || "").toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q);
      if (!hay) return false;
    }
    return true;
  });

  renderActiveFilters({ sucursal, seccion, curso, estado, prioridad, q });
  renderKPIs();
  renderChartSucursal();
  renderChartEstado();
  renderTable();
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

function renderChartSucursal() {
  const rows = state.filtered;
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
    row.className = "hbar-row";
    const safeName = escapeHtml(e.sucursal);
    row.innerHTML = `
      <div class="name" title="${safeName}">${safeName}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(e.tasa, 2)}%"></div></div>
      <div class="pct">${e.tasa.toFixed(0)}%</div>
    `;
    container.appendChild(row);
  }
}

function renderChartEstado() {
  const rows = state.filtered;
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
    col.className = "estado-bar-col";
    const h = Math.max((val / max) * 100, val > 0 ? 4 : 0);
    col.innerHTML = `
      <div class="val">${val.toLocaleString("es-CL")}</div>
      <div class="bar" style="height:${h}%; background:${colors[estado]}"></div>
      <div class="lbl">${estado}</div>
    `;
    container.appendChild(col);
  }
}

function sortRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va, vb;
    if (key === "prioridad") {
      va = PRIORIDAD_ORDER[a.prioridad];
      vb = PRIORIDAD_ORDER[b.prioridad];
    } else if (key === "fechaTermino") {
      va = a.fechaTermino || "9999";
      vb = b.fechaTermino || "9999";
    } else {
      va = (a[key] || "").toString().toLowerCase();
      vb = (b[key] || "").toString().toLowerCase();
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function badgeHtml(r) {
  if (r.estadoCurso === "Completado") return '<span class="badge completado"><span class="dot"></span>Completado</span>';
  if (r.prioridad === "Alta") return '<span class="badge alta"><span class="dot"></span>Alta</span>';
  if (r.prioridad === "Media") return '<span class="badge media"><span class="dot"></span>Media</span>';
  return '<span class="badge baja"><span class="dot"></span>Baja</span>';
}

function renderTable() {
  const sorted = sortRows(state.filtered);
  const shown = sorted.slice(0, state.rowLimit);
  const tbody = document.getElementById("plan-tbody");
  tbody.innerHTML = "";

  if (!shown.length) {
    document.getElementById("table-empty").style.display = "block";
  } else {
    document.getElementById("table-empty").style.display = "none";
  }

  const frag = document.createDocumentFragment();
  for (const r of shown) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="name">${escapeHtml(r.nombre)}</td>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.sucursal)}</td>
      <td>${escapeHtml(r.curso)}</td>
      <td>${escapeHtml(r.fechaTermino) || "—"}</td>
      <td>${badgeHtml(r)}</td>
      <td>${escapeHtml(accionSugerida(r.prioridad, r.dias))}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);

  document.getElementById("table-count").textContent =
    `Mostrando ${shown.length.toLocaleString("es-CL")} de ${sorted.length.toLocaleString("es-CL")} registros filtrados`;
  document.getElementById("btn-more").style.display = sorted.length > shown.length ? "inline-block" : "none";
}

function exportCsv() {
  const sorted = sortRows(state.filtered);
  const header = ["id_alumno", "nombre_alumno", "sucursal", "seccion", "curso", "fecha_inicio", "fecha_termino", "estado_curso", "nota", "prioridad", "accion_sugerida"];
  const lines = [header.join(",")];
  for (const r of sorted) {
    const accion = accionSugerida(r.prioridad, r.dias);
    const vals = [r.id, r.nombre, r.sucursal, r.seccion, r.curso, r.fechaInicio, r.fechaTermino, r.estadoCurso, r.nota, r.prioridad, accion]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
    lines.push(vals.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plan_de_accion_filtrado.csv";
  a.click();
  URL.revokeObjectURL(url);
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
  document.getElementById("btn-more").addEventListener("click", () => {
    state.rowLimit += 300;
    renderTable();
  });
  document.querySelectorAll("table.plan th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      state.rowLimit = 300;
      renderTable();
    });
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
