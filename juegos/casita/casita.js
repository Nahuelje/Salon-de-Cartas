// La casita robada: solo importa el número, no el palo.
// En tu turno elegís una carta de la mano y podés:
//   - capturar cartas de la mesa con el mismo número (elegís cuáles),
//   - robar la casita de un rival si la carta de arriba de su casita tiene el mismo número,
//   - o dejar la carta en la mesa.
const JUEGO_ID = "casita";
const RANGOS = RANGOS_40; // mazo de 40 cartas: A, 2-7, J, Q y K
const MANO = 3;
const MESA_INICIAL = 4;

let jugadores = [];  // { nombre, humano, mano: [], casita: [], robos: 0 }
let mazo = [];
let mesa = [];
let turno = 0;
let ultimoCapturador = -1;
let cargando = false;
let revelado = true;
let activo = false;
let animarReparto = true;
let cartaSel = -1;         // índice en la mano de la carta elegida
let mesaSel = new Set();   // índices de la mesa elegidos para capturar
let registro = [];

const humanos = () => jugadores.filter((j) => j.humano).length;
const topeCasita = (j) => j.casita[j.casita.length - 1];

// Rivales cuya casita se puede robar con esta carta (mismo número que su carta de arriba).
function victimasPara(idx, carta) {
  const lista = [];
  jugadores.forEach((o, i) => {
    if (i === idx || o.casita.length === 0) return;
    if (topeCasita(o).rango === carta.rango) lista.push(i);
  });
  return lista;
}

// Cartas de la mesa con el mismo número.
function mesaCoincide(carta) {
  const idx = [];
  mesa.forEach((c, k) => {
    if (c.rango === carta.rango) idx.push(k);
  });
  return idx;
}

// Conjuga según el nombre: "Vos" va en segunda persona, el resto en tercera.
const esVos = (j) => j.humano && j.nombre.trim().toLowerCase() === "vos";
const verbo = (j, tercera, voseo) => (esVos(j) ? voseo : tercera);

function registrar(texto) {
  registro.unshift(texto);
  registro = registro.slice(0, 6);
}

// ---------- Partida ----------

function empezarPartida(config) {
  jugadores = config.jugadores.map((j) => ({ ...j, mano: [], casita: [], robos: 0 }));
  mazo = mezclar(barajaCompleta(RANGOS));
  mesa = [];
  for (let i = 0; i < MESA_INICIAL; i++) mesa.push(mazo.pop());
  jugadores.forEach((j) => {
    for (let k = 0; k < MANO; k++) j.mano.push(mazo.pop());
  });
  turno = 0;
  ultimoCapturador = -1;
  cartaSel = -1;
  mesaSel = new Set();
  registro = [];
  activo = true;
  cargando = false;
  animarReparto = true;
  $("setup").classList.add("oculto");
  $("juego").classList.remove("oculto");
  Sonidos.iniciar();
  Sonidos.reproducir("card-shuffle");
  prepararTurno();
}

function prepararTurno() {
  const j = jugadores[turno];
  cartaSel = -1;
  mesaSel = new Set();
  revelado = humanos() <= 1 || !j.humano;
  render();
  if (!j.humano) jugarBot();
  else if (!revelado) mostrarCortina();
}

function siguienteTurno() {
  // Salta a los jugadores sin cartas. Si nadie tiene cartas, termina la partida.
  const n = jugadores.length;
  for (let k = 1; k <= n; k++) {
    const i = (turno + k) % n;
    if (jugadores[i].mano.length > 0) return i;
  }
  return -1;
}

// Ejecuta una jugada de cualquier jugador (humano o bot).
// accion: { tipo: "robo", victima } | { tipo: "captura", indices: [...] } | { tipo: "mesa" }
function ejecutar(idx, iMano, accion) {
  const j = jugadores[idx];
  const [carta] = j.mano.splice(iMano, 1);

  // Vuelo visual de la carta: de la mano al destino.
  const desde = j.humano && revelado ? $("mano").children[iMano] : document.querySelector(`.rival[data-j="${idx}"]`);
  const hacia = accion.tipo === "robo"
    ? document.querySelector(`.rival[data-j="${accion.victima}"]`) || $("mesa")
    : $("mesa");
  volarCarta(desde, hacia, archivoCarta(carta.palo, carta.rango));

  if (accion.tipo === "robo") {
    const v = jugadores[accion.victima];
    const n = v.casita.length;
    j.casita.push(...v.casita, carta);
    v.casita = [];
    j.robos++;
    ultimoCapturador = idx;
    Sonidos.reproducir("chips-stack-1");
    Fx.banner(esVos(j) ? "¡ROBASTE LA CASITA!" : `¡${j.nombre.toUpperCase()} ROBÓ!`);
    Fx.destello("rgba(255, 204, 41, .25)");
    registrar(`🏠 ${j.nombre} ${verbo(j, "robó", "robaste")} la casita de ${v.nombre} (${n} carta${n > 1 ? "s" : ""}) con un ${carta.rango}.`);
  } else if (accion.tipo === "captura") {
    const tomadas = [...accion.indices].sort((a, b) => b - a).map((k) => mesa.splice(k, 1)[0]);
    j.casita.push(...tomadas, carta);
    ultimoCapturador = idx;
    Sonidos.reproducir("chip-lay-1");
    registrar(`${j.nombre} ${verbo(j, "capturó", "capturaste")} ${tomadas.length} carta${tomadas.length > 1 ? "s" : ""} de la mesa con un ${carta.rango}.`);
  } else {
    mesa.push(carta);
    Sonidos.variante("card-place", 4);
    registrar(`${j.nombre} ${verbo(j, "dejó", "dejaste")} un ${carta.rango} en la mesa.`);
  }

  while (j.mano.length < MANO && mazo.length) j.mano.push(mazo.pop());

  cartaSel = -1;
  mesaSel = new Set();

  if (jugadores.every((p) => p.mano.length === 0)) return terminar();
  const sig = siguienteTurno();
  if (sig === -1) return terminar();
  turno = sig;
  prepararTurno();
}

// ---------- Acciones del humano ----------

const puedeActuar = () => activo && !cargando && jugadores[turno].humano && revelado;

function clicCartaMano(i) {
  if (!puedeActuar()) return;
  if (cartaSel === i) {
    cartaSel = -1;
    mesaSel = new Set();
  } else {
    cartaSel = i;
    // Se preseleccionan todas las coincidencias de la mesa; podés destildar las que no quieras.
    mesaSel = new Set(mesaCoincide(jugadores[turno].mano[i]));
  }
  Sonidos.variante("card-slide", 8);
  render();
}

function clicCartaMesa(k) {
  if (!puedeActuar() || cartaSel < 0) return;
  const carta = jugadores[turno].mano[cartaSel];
  if (mesa[k].rango !== carta.rango) return;
  if (mesaSel.has(k)) mesaSel.delete(k);
  else mesaSel.add(k);
  Sonidos.reproducir("chips-stack-1");
  render();
}

function clicRival(i) {
  if (!puedeActuar() || cartaSel < 0) return;
  const carta = jugadores[turno].mano[cartaSel];
  if (!victimasPara(turno, carta).includes(i)) return;
  ejecutar(turno, cartaSel, { tipo: "robo", victima: i });
}

function clicCapturar() {
  if (!puedeActuar() || cartaSel < 0 || mesaSel.size === 0) return;
  ejecutar(turno, cartaSel, { tipo: "captura", indices: [...mesaSel] });
}

function clicDejar() {
  if (!puedeActuar() || cartaSel < 0) return;
  ejecutar(turno, cartaSel, { tipo: "mesa" });
}

// ---------- Bots ----------

function elegirJugadaBot(idx) {
  const j = jugadores[idx];
  let mejor = null;
  j.mano.forEach((c, i) => {
    const victimas = victimasPara(idx, c);
    if (victimas.length) {
      const v = victimas.sort((a, b) => jugadores[b].casita.length - jugadores[a].casita.length)[0];
      const valor = 100 + jugadores[v].casita.length;
      if (!mejor || valor > mejor.valor) mejor = { valor, iMano: i, accion: { tipo: "robo", victima: v } };
      return;
    }
    const indices = mesaCoincide(c);
    if (indices.length) {
      const valor = 10 * indices.length;
      if (!mejor || valor > mejor.valor) mejor = { valor, iMano: i, accion: { tipo: "captura", indices } };
    }
  });
  if (!mejor) {
    mejor = { valor: 0, iMano: Math.floor(Math.random() * j.mano.length), accion: { tipo: "mesa" } };
  }
  return mejor;
}

function jugarBot() {
  cargando = true;
  render();
  setTimeout(() => {
    const idx = turno;
    const { iMano, accion } = elegirJugadaBot(idx);
    cargando = false;
    ejecutar(idx, iMano, accion);
  }, 1000);
}

// ---------- Fin ----------

function terminar() {
  activo = false;
  // Las cartas que quedan en la mesa van a quien capturó por último.
  if (mesa.length && ultimoCapturador >= 0) {
    jugadores[ultimoCapturador].casita.push(...mesa);
    registrar(`${jugadores[ultimoCapturador].nombre} se lleva las ${mesa.length} cartas que quedaron en la mesa.`);
    mesa = [];
  }
  const ordenados = [...jugadores].sort((a, b) => b.casita.length - a.casita.length);
  const ganador = ordenados[0];
  const empate = ordenados.length > 1 && ordenados[1].casita.length === ganador.casita.length;

  if (ganador.humano && !empate) {
    const puntos = ganador.casita.length * 10 + ganador.robos * 50;
    Ranking.agregar(JUEGO_ID, {
      nombre: ganador.nombre.slice(0, 8).toUpperCase(),
      puntos,
      detalle: `${ganador.casita.length} cartas · ${ganador.robos} robos`,
    });
  }

  render();
  Sonidos.ganar();
  const filas = ordenados.map((j) => `<tr><td>${j.nombre}</td><td>${j.casita.length}</td><td>${j.robos}</td></tr>`).join("");
  Modal.abrir({
    titulo: empate ? "¡Empate!" : `Ganó ${ganador.nombre}`,
    html: `<table class="tabla-ranking"><thead><tr><th>Jugador</th><th>Casita</th><th>Robos</th></tr></thead><tbody>${filas}</tbody></table>`,
    boton: "Volver al menú",
    onBoton: () => {
      $("juego").classList.add("oculto");
      $("setup").classList.remove("oculto");
      renderRanking();
    },
  });
}

function abandonar() {
  if (!activo) return;
  if (!confirm("¿Abandonar la partida? Se pierde el progreso.")) return;
  activo = false;
  cargando = false;
  $("juego").classList.add("oculto");
  $("setup").classList.remove("oculto");
}

// ---------- Render ----------

function mostrarCortina() {
  $("cortina-titulo").textContent = `Turno de ${jugadores[turno].nombre}`;
  $("cortina-texto").textContent = "Pasá el celular. Que nadie más mire la pantalla.";
  $("cortina").classList.remove("oculto");
}

function etiquetaCarta(c) {
  const v = victimasPara(turno, c);
  if (v.length) return `Roba casita de ${jugadores[v[0]].nombre}`;
  const m = mesaCoincide(c).length;
  if (m) return `Captura ${m} de la mesa`;
  return "Va a la mesa";
}

// Casita como una pila: carta de arriba a la vista, con la cantidad al lado.
function htmlCasita(j) {
  const top = topeCasita(j);
  if (!top) return `<div class="casita-vacia">Casita vacía</div><div class="cuenta">0<small>cartas</small></div>`;
  return `<div class="apilado"><img class="img-carta" src="${archivoCarta(top.palo, top.rango)}" alt="Carta de arriba: ${top.rango} de ${top.palo}"></div>
    <div class="cuenta">${j.casita.length}<small>${j.casita.length === 1 ? "carta" : "cartas"}</small><small>arriba: ${top.rango}</small></div>`;
}

function render() {
  const j = jugadores[turno];
  $("s-mazo").textContent = mazo.length;
  $("s-turno").textContent = j ? j.nombre : "-";

  const carta = cartaSel >= 0 && j && j.humano ? j.mano[cartaSel] : null;
  const victimas = carta ? victimasPara(turno, carta) : [];

  // Rivales (o todos los demás): casita visible y cartas en mano boca abajo.
  const humanoMirando = j && j.humano && revelado ? turno : -1;
  $("rivales").innerHTML = jugadores
    .map((p, i) => {
      if (i === humanoMirando) return "";
      const robable = victimas.includes(i);
      const dorsos = Array.from({ length: p.mano.length }, () => `<img class="img-carta" src="${archivoDorso()}" alt="">`).join("");
      return `<div class="rival${i === turno ? " turno" : ""}${robable ? " robable" : ""}" data-j="${i}" ${robable ? 'role="button" tabindex="0"' : ""}>
        <div class="nombre">${p.nombre}${p.humano ? "" : " 🤖"}${i === turno ? " ◀" : ""}</div>
        <div class="casita-zona">${htmlCasita(p)}</div>
        <div class="abanico">${dorsos}</div>
        <div class="pixel-chico">Robos: ${p.robos}</div>
        ${robable ? '<div class="etiqueta-robo">¡Tocá para robarla!</div>' : ""}
      </div>`;
    })
    .join("");

  // Mi casita: la del jugador que está mirando (o la del primer humano).
  const duenio = humanoMirando >= 0 ? jugadores[humanoMirando] : jugadores.find((p) => p.humano);
  $("mi-casita").innerHTML = duenio ? htmlCasita(duenio) : "";

  // Mesa: las cartas del mismo número se resaltan y se pueden elegir.
  $("mesa").innerHTML = "";
  if (mesa.length === 0) {
    $("mesa").innerHTML = `<span class="mesa-vacia">La mesa está vacía</span>`;
  } else {
    mesa.forEach((c, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carta-mesa";
      b.dataset.k = k;
      const coincide = carta && c.rango === carta.rango;
      if (coincide) b.classList.add("coincide");
      if (mesaSel.has(k)) b.classList.add("elegida");
      b.setAttribute("aria-label", `${c.rango} de ${c.palo}${coincide ? (mesaSel.has(k) ? ", elegida para capturar" : ", se puede capturar") : ""}`);
      b.appendChild(crearImagenCarta(c.palo, c.rango));
      $("mesa").appendChild(b);
    });
  }

  // Mi mano.
  const manoEl = $("mano");
  manoEl.innerHTML = "";
  if (j && j.humano && revelado && activo) {
    j.mano.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carta-mano" + (i === cartaSel ? " seleccionada" : "") + (animarReparto ? " repartida" : "");
      if (animarReparto) b.style.animationDelay = `${i * 90}ms`;
      b.disabled = cargando;
      b.dataset.i = i;
      b.setAttribute("aria-pressed", String(i === cartaSel));
      b.setAttribute("aria-label", `${c.rango} de ${c.palo}`);
      b.appendChild(crearImagenCarta(c.palo, c.rango));
      const etq = document.createElement("small");
      etq.textContent = etiquetaCarta(c);
      b.appendChild(etq);
      manoEl.appendChild(b);
    });
    animarReparto = false;
  }

  // Botones y mensaje de ayuda.
  const puedo = puedeActuar();
  $("btn-capturar").disabled = !(puedo && carta && mesaSel.size > 0);
  $("btn-capturar").textContent = mesaSel.size > 0 ? `Capturar ${mesaSel.size} de la mesa` : "Capturar de la mesa";
  $("btn-dejar").disabled = !(puedo && carta);

  let aviso = "";
  if (!activo) aviso = "";
  else if (!j.humano) aviso = `${j.nombre} está pensando…`;
  else if (!revelado) aviso = `Turno de ${j.nombre}: revelá tu mano`;
  else if (!carta) aviso = "Elegí una carta de tu mano.";
  else {
    const opciones = [];
    if (victimas.length) opciones.push(`robar la casita de ${victimas.map((v) => jugadores[v].nombre).join(" o ")} (tocala)`);
    if (mesaCoincide(carta).length) opciones.push(`capturar de la mesa (elegí cuáles y tocá "Capturar")`);
    opciones.push("dejarla en la mesa");
    aviso = `Con el ${carta.rango} podés: ${opciones.join(", o ")}.`;
  }
  $("aviso").textContent = aviso;

  $("registro").innerHTML = registro.length
    ? registro.map((t) => `<li>${t}</li>`).join("")
    : `<li>Todavía no hubo jugadas.</li>`;
}

function renderRanking() {
  $("ranking").innerHTML = Ranking.html(JUEGO_ID);
}

function renderSetupAmigos() {
  const n = Number($("cant-amigos").value);
  $("nombres-amigos").innerHTML = Array.from({ length: n }, (_, i) =>
    `<label for="amigo-${i}">Jugador ${i + 1}</label><input id="amigo-${i}" maxlength="10" value="Jugador ${i + 1}" autocomplete="off">`
  ).join("");
}

function leerConfiguracion() {
  if ($("modo").value === "amigos") {
    const n = Number($("cant-amigos").value);
    const lista = Array.from({ length: n }, (_, i) => ({
      nombre: ($(`amigo-${i}`).value || `Jugador ${i + 1}`).trim().slice(0, 10),
      humano: true,
    }));
    return { jugadores: lista };
  }
  const bots = Number($("cant-bots").value);
  const lista = [{ nombre: ($("nombre-humano").value || "Vos").trim().slice(0, 10), humano: true }];
  for (let i = 1; i <= bots; i++) lista.push({ nombre: `Bot ${i}`, humano: false });
  return { jugadores: lista };
}

function init() {
  $("modo").onchange = () => {
    const amigos = $("modo").value === "amigos";
    $("cfg-amigos").classList.toggle("oculto", !amigos);
    $("cfg-bots").classList.toggle("oculto", amigos);
  };
  $("cant-amigos").onchange = renderSetupAmigos;
  renderSetupAmigos();

  $("btn-empezar").onclick = () => empezarPartida(leerConfiguracion());
  $("btn-abandonar").onclick = abandonar;
  $("btn-capturar").onclick = clicCapturar;
  $("btn-dejar").onclick = clicDejar;
  $("btn-revelar").onclick = () => {
    revelado = true;
    $("cortina").classList.add("oculto");
    render();
  };

  $("mano").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) clicCartaMano(Number(b.dataset.i));
  });
  $("mesa").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) clicCartaMesa(Number(b.dataset.k));
  });
  const robar = (e) => {
    const r = e.target.closest(".rival.robable");
    if (r) clicRival(Number(r.dataset.j));
  };
  $("rivales").addEventListener("click", robar);
  $("rivales").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      robar(e);
    }
  });

  $("btn-sonido").onclick = () => {
    Sonidos.alternar();
    $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  };
  $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  document.addEventListener("pointerdown", () => Sonidos.precargar(["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4", "card-slide-5", "card-slide-6", "card-slide-7", "card-slide-8", "card-place-1", "card-place-2", "chip-lay-1", "chips-stack-1", "card-shuffle"]), { once: true });
  renderRanking();
}

init();
