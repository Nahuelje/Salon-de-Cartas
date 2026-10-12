// Chinchón (versión de mesa): contra bots o con amigos pasando el celular.
const JUEGO_ID = "chinchon";
const ORDEN = RANGOS_40; // mazo de 40 cartas: A, 2-7, J, Q y K (sin 8, 9 y 10)
const VALOR = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, J: 10, Q: 10, K: 10 };
const LIMITE = 100;          // al llegar a este puntaje se queda afuera
const CORTE_MAX = 5;         // lo que queda sin combinar para poder cortar
const PENALIDAD_CORTE = 10;  // si cortás y alguien tiene menos, te suman 10
const CHINCHON_PUNTOS = -25; // cerrar con chinchón

let jugadores = [];  // { nombre, humano, mano, total, eliminado }
let mazo = [];
let pila = [];       // la última carta es la visible
let turno = 0;
let repartidor = 0;
let ronda = 1;
let fase = "robar";  // "robar" | "descartar" | "fin"
let seleccionado = -1;
let cargando = false;
let revelado = true;
let partidoActivo = false;
let modoActual = "bots";
let animarReparto = false;

const valor = (c) => VALOR[c.rango];
const sumaValores = (cs) => cs.reduce((s, c) => s + valor(c), 0);

// Juego: 3 o 4 cartas del mismo número y de palos distintos.
function esJuego(cs) {
  if (cs.length < 3 || cs.length > 4) return false;
  if (!cs.every((c) => c.rango === cs[0].rango)) return false;
  return new Set(cs.map((c) => c.palo)).size === cs.length;
}

// Escalera: 3 o más cartas del mismo palo, consecutivas en el orden de la baraja.
function esEscalera(cs) {
  if (cs.length < 3) return false;
  if (!cs.every((c) => c.palo === cs[0].palo)) return false;
  const idx = cs.map((c) => ORDEN.indexOf(c.rango)).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1) return false;
  return true;
}

const esCombinacion = (cs) => esJuego(cs) || esEscalera(cs);

// Núcleo: busca la mejor forma de combinar la mano (máscara de cartas combinadas).
function resolver(mano) {
  const n = mano.length;
  const total = (1 << n) - 1;
  const combina = new Array(1 << n).fill(false);
  for (let m = 1; m <= total; m++) {
    const sub = mano.filter((_, i) => (m >> i) & 1);
    combina[m] = sub.length >= 3 && esCombinacion(sub);
  }

  const memo = new Map();
  // Un conjunto se puede cubrir si se separa en combinaciones disjuntas.
  function cubrible(m) {
    if (m === 0) return true;
    if (memo.has(m)) return memo.get(m);
    const bajo = m & -m;
    let ok = false;
    for (let s = m; s > 0; s = (s - 1) & m) {
      if ((s & bajo) && combina[s] && cubrible(m ^ s)) {
        ok = true;
        break;
      }
    }
    memo.set(m, ok);
    return ok;
  }

  let mejor = Infinity;
  let mejorMask = 0;
  for (let m = 0; m <= total; m++) {
    if (!cubrible(m)) continue;
    const sobrante = mano.filter((_, i) => !((m >> i) & 1));
    const puntos = sumaValores(sobrante);
    if (puntos < mejor) {
      mejor = puntos;
      mejorMask = m;
    }
  }
  return { combina, cubrible, mejor, mejorMask };
}

// Puntos sin combinar y si la mano completa es un chinchón (7 cartas en escalera).
function analizar(mano) {
  const { mejor } = resolver(mano);
  return { puntos: mejor, chinchon: mano.length === 7 && esEscalera(mano) };
}

const indicesDe = (mask, n) => Array.from({ length: n }, (_, i) => i).filter((i) => (mask >> i) & 1);

// Detalle para mostrar: qué cartas forman cada combinación y cuáles quedan sueltas.
function detalle(mano) {
  const n = mano.length;
  const { combina, cubrible, mejor, mejorMask } = resolver(mano);
  const grupos = [];
  let resto = mejorMask;
  while (resto) {
    const bajo = resto & -resto;
    let hallado = false;
    for (let s = resto; s > 0; s = (s - 1) & resto) {
      if ((s & bajo) && combina[s] && cubrible(resto ^ s)) {
        grupos.push(indicesDe(s, n));
        resto ^= s;
        hallado = true;
        break;
      }
    }
    if (!hallado) break;
  }
  const sueltas = indicesDe(((1 << n) - 1) ^ mejorMask, n);
  return { puntos: mejor, grupos, sueltas };
}

// Orden de la mano: combinaciones primero, después las sueltas por palo y número.
function ordenarCartas(mano) {
  const clave = (c) => PALOS.indexOf(c.palo) * 20 + ORDEN.indexOf(c.rango);
  const d = detalle(mano);
  const porClave = (a, b) => clave(mano[a]) - clave(mano[b]);
  const grupos = d.grupos.map((g) => [...g].sort(porClave)).sort((a, b) => porClave(a[0], b[0]));
  return [...grupos.flat(), ...[...d.sueltas].sort(porClave)].map((i) => mano[i]);
}

// Entre las cartas, elige cuál descartar para quedarse con menos puntos.
function mejorDescarte(mano) {
  let mejor = null;
  mano.forEach((c, i) => {
    const restante = mano.filter((_, k) => k !== i);
    const { puntos } = analizar(restante);
    const empate = mejor && puntos === mejor.puntos && valor(c) > valor(mano[mejor.indice]);
    if (!mejor || puntos < mejor.puntos || empate) mejor = { indice: i, puntos };
  });
  return mejor;
}

const siguienteActivo = (desde) => {
  const n = jugadores.length;
  for (let k = 1; k <= n; k++) {
    const i = (desde + k) % n;
    if (!jugadores[i].eliminado) return i;
  }
  return desde;
};

const activos = () => jugadores.filter((j) => !j.eliminado);
const humanos = () => jugadores.filter((j) => j.humano && !j.eliminado).length;

// ---------- Partida ----------

function empezarPartido(config) {
  jugadores = config.jugadores.map((j) => ({ ...j, mano: [], total: 0, eliminado: false }));
  modoActual = config.modo;
  ronda = 1;
  repartidor = 0;
  partidoActivo = true;
  $("setup").classList.add("oculto");
  $("juego").classList.remove("oculto");
  Sonidos.iniciar();
  nuevaRonda();
}

function nuevaRonda() {
  mazo = mezclar(barajaCompleta(ORDEN));
  jugadores.forEach((j) => {
    j.mano = [];
    if (!j.eliminado) for (let i = 0; i < 7; i++) j.mano.push(mazo.pop());
  });
  pila = [mazo.pop()];
  fase = "robar";
  seleccionado = -1;
  cargando = false;
  animarReparto = true;
  Sonidos.reproducir("card-shuffle");
  turno = siguienteActivo(repartidor);
  revelado = humanos() <= 1 || !jugadores[turno].humano;
  render();
  if (!jugadores[turno].humano) jugarBot();
  else if (!revelado) mostrarCortina();
}

function rearmarMazo() {
  const visible = pila.pop();
  mazo = mezclar(pila);
  pila = [visible];
}

function robarInterno(origen) {
  const j = jugadores[turno];
  // Vuelo visual de la carta desde el mazo o la pila hacia la mano (o hacia el rival).
  const tope = pila[pila.length - 1];
  const destino = j.humano && revelado ? $("mano") : document.querySelector(`.rival[data-j="${turno}"]`);
  if (origen === "mazo") volarCarta($("img-mazo"), destino, archivoDorso());
  else if (tope) volarCarta($("img-pila"), destino, archivoCarta(tope.palo, tope.rango));
  if (origen === "mazo") {
    if (mazo.length === 0) rearmarMazo();
    // Si ni siquiera con la pila alcanza, se roba la visible de la pila.
    j.mano.push(mazo.length ? mazo.pop() : pila.pop());
  } else {
    j.mano.push(pila.pop());
  }
  Sonidos.variante("card-slide", 8);
  fase = "descartar";
  seleccionado = -1;
}

function descartarInterno(i) {
  const j = jugadores[turno];
  const origenEl = j.humano && revelado ? $("mano").children[i] : document.querySelector(`.rival[data-j="${turno}"]`);
  if (j.mano[i]) volarCarta(origenEl, $("img-pila"), archivoCarta(j.mano[i].palo, j.mano[i].rango));
  const [carta] = j.mano.splice(i, 1);
  pila.push(carta);
  Sonidos.variante("card-place", 4);
}

function avanzarTurno() {
  turno = siguienteActivo(turno);
  fase = "robar";
  seleccionado = -1;
  revelado = humanos() <= 1 || !jugadores[turno].humano;
  render();
  if (!jugadores[turno].humano) jugarBot();
  else if (!revelado) mostrarCortina();
}

function puedeCortar(i) {
  if (i < 0) return false;
  const restante = jugadores[turno].mano.filter((_, k) => k !== i);
  return analizar(restante).puntos <= CORTE_MAX;
}

function puedeChinchon(i) {
  if (i < 0) return false;
  const restante = jugadores[turno].mano.filter((_, k) => k !== i);
  return analizar(restante).chinchon;
}

// ---------- Acciones humanas ----------

function clicRobar(origen) {
  if (cargando || fase !== "robar" || !jugadores[turno].humano || !revelado) return;
  robarInterno(origen);
  render();
}

function clicCarta(i) {
  if (cargando || fase !== "descartar" || !jugadores[turno].humano || !revelado) return;
  seleccionado = seleccionado === i ? -1 : i;
  render();
}

function clicDescartar() {
  if (cargando || fase !== "descartar" || seleccionado < 0) return;
  descartarInterno(seleccionado);
  avanzarTurno();
}

function clicCortar() {
  if (cargando || fase !== "descartar" || !puedeCortar(seleccionado)) return;
  descartarInterno(seleccionado);
  terminarRonda(turno, false);
}

function clicOrdenar() {
  const j = jugadores[turno];
  if (cargando || !j.humano || !revelado) return;
  j.mano = ordenarCartas(j.mano);
  seleccionado = -1;
  Sonidos.variante("card-slide", 8);
  render();
}

function clicReglas() {
  Modal.abrir({
    titulo: "Reglas",
    html: `
      <p><strong>Objetivo:</strong> quedarte con la menor cantidad de puntos. Al llegar a ${LIMITE} quedás eliminado y gana el último en pie.</p>
      <p><strong>Turno:</strong> robás una carta del mazo o la visible de la pila y descartás una.</p>
      <p><strong>Combinaciones:</strong> una escalera son 3 o más cartas del mismo palo en orden (A-2-3-4-5-6-7-J-Q-K). Un juego son 3 o 4 cartas del mismo número y de palos distintos.</p>
      <p><strong>Puntos:</strong> las cartas sin combinar suman su número (el as vale 1); J, Q y K valen 10.</p>
      <p><strong>Cortar:</strong> si al descartar te quedan ${CORTE_MAX} puntos o menos sin combinar. Si alguien tiene menos que vos, sumás ${PENALIDAD_CORTE} de penalidad.</p>
      <p><strong>Chinchón:</strong> las 7 cartas en una escalera del mismo palo. Restás ${-CHINCHON_PUNTOS} puntos.</p>`,
    boton: "Entendido",
  });
}

function clicChinchon() {
  if (cargando || fase !== "descartar" || !puedeChinchon(seleccionado)) return;
  descartarInterno(seleccionado);
  terminarRonda(turno, true);
}

// ---------- Bots ----------

function jugarBot() {
  cargando = true;
  render();
  setTimeout(() => {
    const j = jugadores[turno];
    const topePila = pila[pila.length - 1];
    const sinRobar = analizar(j.mano).puntos;
    const conPila = mejorDescarte([...j.mano, topePila]).puntos;
    const nivel = j.dificultad || "normal";
    let origen = conPila < sinRobar ? "pila" : "mazo";
    // El bot fácil a veces se pierde la jugada de la pila.
    if (nivel === "facil" && origen === "pila" && Math.random() < 0.4) origen = "mazo";
    robarInterno(origen);
    render();
    setTimeout(() => {
      let d = mejorDescarte(j.mano);
      // El bot fácil de vez en cuando descarta una carta al azar.
      if (nivel === "facil" && Math.random() < 0.25) d = { indice: Math.floor(Math.random() * j.mano.length) };
      const restante = j.mano.filter((_, k) => k !== d.indice);
      const a = analizar(restante);
      const umbral = nivel === "facil" ? 3 : CORTE_MAX;
      const probabilidad = nivel === "facil" ? 0.4 : nivel === "dificil" ? 0.95 : 0.7;
      const corta = a.chinchon || (a.puntos <= umbral && Math.random() < probabilidad);
      descartarInterno(d.indice);
      cargando = false;
      if (corta) terminarRonda(turno, a.chinchon);
      else avanzarTurno();
    }, 900);
  }, 700);
}

// ---------- Fin de ronda y de partida ----------

function terminarRonda(cortador, chinchon) {
  fase = "fin";
  cargando = true;
  const pts = jugadores.map((j) => (j.eliminado ? null : analizar(j.mano)));
  const otros = jugadores
    .map((_, i) => i)
    .filter((i) => i !== cortador && !jugadores[i].eliminado);
  const minOtros = Math.min(...otros.map((i) => pts[i].puntos));

  const filas = [];
  const manos = [];
  jugadores.forEach((j, i) => {
    if (j.eliminado) return;
    manos.push(htmlManoFinal(j));
    let suma;
    if (i === cortador) {
      if (chinchon) suma = CHINCHON_PUNTOS;
      else suma = pts[i].puntos <= minOtros ? 0 : pts[i].puntos + PENALIDAD_CORTE;
    } else {
      suma = pts[i].puntos;
    }
    j.total += suma;
    if (j.total >= LIMITE) j.eliminado = true;
    filas.push({ nombre: j.nombre, sinCombinar: pts[i].puntos, suma, total: j.total, eliminado: j.eliminado });
  });

  Sonidos.perder();
  render();

  const cortadorNombre = jugadores[cortador].nombre;
  const tabla = `<table class="tabla-ranking">
    <thead><tr><th>Jugador</th><th>Sin comb.</th><th>Ronda</th><th>Total</th></tr></thead>
    <tbody>${filas.map((f) => `<tr><td>${f.nombre}${f.eliminado ? " ✖" : ""}</td><td>${f.sinCombinar}</td><td>${f.suma}</td><td>${f.total}</td></tr>`).join("")}</tbody>
  </table>`;
  const titulo = chinchon
    ? `¡CHINCHÓN de ${cortadorNombre}!`
    : `${cortadorNombre} cortó`;

  const restantes = activos();
  // Termina si queda uno solo o si ya no queda ningún humano jugando.
  const termina = restantes.length <= 1 || humanos() === 0;
  Modal.abrir({
    titulo,
    html: tabla + `<div class="manos-finales">${manos.join("")}</div>`,
    boton: termina ? "Ver resultado final" : "Siguiente ronda",
    onBoton: () => {
      if (termina) return finPartido();
      ronda++;
      repartidor = siguienteActivo(repartidor);
      nuevaRonda();
    },
  });
}

// Mano de un jugador al cerrar la ronda, con sus combinaciones marcadas por color.
function htmlManoFinal(j) {
  const d = detalle(j.mano);
  const grupoDe = {};
  d.grupos.forEach((g, n) => g.forEach((i) => (grupoDe[i] = n)));
  const orden = [...d.grupos.flat(), ...d.sueltas];
  const cartas = orden.map((i) => {
    const c = j.mano[i];
    const g = grupoDe[i] !== undefined ? `g${grupoDe[i] % 4}` : "";
    return `<span class="${g}"><img class="img-carta" src="${archivoCarta(c.palo, c.rango)}" alt="${c.rango} de ${c.palo}"></span>`;
  }).join("");
  return `<div class="mano-final"><div class="pixel-chico">${j.nombre} · ${d.puntos} pts sin combinar</div><div class="abanico">${cartas}</div></div>`;
}

function finPartido() {
  partidoActivo = false;
  // Con un solo sobreviviente gana ese; si quedan varios (sin humanos) gana el de menos puntos.
  const ganador = [...activos()].sort((a, b) => a.total - b.total)[0];
  const rivales = jugadores.length - 1;
  if (ganador && ganador.humano) {
    const puntos = 1000 + 100 * rivales - 20 * ronda;
    Ranking.agregar(JUEGO_ID, {
      nombre: ganador.nombre.slice(0, 8).toUpperCase(),
      puntos,
      detalle: `${ronda} rondas · ${rivales} rivales`,
    });
  }
  Sonidos.ganar();
  Fx.banner(`¡GANÓ ${ganador ? ganador.nombre.toUpperCase() : "NADIE"}!`);
  Modal.abrir({
    titulo: "Fin de la partida",
    html: `<p>${ganador ? `Ganó <strong>${ganador.nombre}</strong>` : "Empate"} en ${ronda} rondas.</p>` +
      (humanos() === 0 && !(ganador && ganador.humano) ? "<p>Quedaste eliminado: no queda ningún jugador humano.</p>" : ""),
    boton: "Jugar de nuevo",
    onBoton: () => {
      $("juego").classList.add("oculto");
      $("setup").classList.remove("oculto");
      renderRanking();
    },
  });
}

function abandonar() {
  if (!partidoActivo) return;
  if (!confirm("¿Abandonar la partida? Se pierde el progreso.")) return;
  partidoActivo = false;
  cargando = false;
  $("juego").classList.add("oculto");
  $("setup").classList.remove("oculto");
}

// ---------- Render ----------

function mostrarCortina() {
  const j = jugadores[turno];
  $("cortina-titulo").textContent = `Turno de ${j.nombre}`;
  $("cortina-texto").textContent = "Pasá el celular. Que nadie más mire la pantalla.";
  $("cortina").classList.remove("oculto");
}

function render() {
  if (!partidoActivo && !jugadores.length) return;
  const j = jugadores[turno];
  $("s-ronda").textContent = ronda;
  $("s-mazo").textContent = mazo.length;

  const puedeRobar = fase === "robar" && j.humano && !cargando;
  $("img-mazo").src = archivoDorso();
  $("img-mazo").classList.toggle("inactiva", !puedeRobar);
  if (pila.length) {
    const tope = pila[pila.length - 1];
    $("img-pila").src = archivoCarta(tope.palo, tope.rango);
    $("img-pila").alt = `${tope.rango} de ${tope.palo}`;
  }
  $("img-pila").classList.toggle("inactiva", !puedeRobar);
  $("pila-apilada").classList.toggle("vacio", pila.length === 0);

  const mostrarMano = j.humano && revelado;
  const manoEl = $("mano");
  manoEl.innerHTML = "";
  if (mostrarMano) {
    const d = detalle(j.mano);
    const grupoDe = {};
    d.grupos.forEach((g, n) => g.forEach((i) => (grupoDe[i] = n)));
    j.mano.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "carta-btn";
      if (grupoDe[i] !== undefined) btn.classList.add(`g${grupoDe[i] % 4}`);
      if (i === seleccionado) btn.classList.add("seleccionada");
      if (animarReparto) {
        btn.classList.add("repartida");
        btn.style.animationDelay = `${i * 70}ms`;
      }
      btn.dataset.i = i;
      btn.setAttribute("aria-pressed", String(i === seleccionado));
      btn.setAttribute("aria-label", `${c.rango} de ${c.palo}${grupoDe[i] !== undefined ? ", combinada" : ""}`);
      btn.appendChild(crearImagenCarta(c.palo, c.rango));
      manoEl.appendChild(btn);
    });
    animarReparto = false;
  }

  const rivales = $("rivales-dorso");
  rivales.innerHTML = "";
  jugadores.forEach((r, i) => {
    if (i === turno && j.humano) return;
    if (r.eliminado) return;
    const wrap = document.createElement("div");
    wrap.className = "rival" + (i === turno ? " turno" : "");
    wrap.dataset.j = i;
    const nombre = document.createElement("div");
    nombre.textContent = `${r.nombre}${r.humano ? "" : " 🤖"}${i === turno ? " ◀" : ""}`;
    wrap.appendChild(nombre);
    const fila = document.createElement("div");
    fila.className = "abanico";
    for (let k = 0; k < r.mano.length; k++) fila.appendChild(crearImagenDorso());
    wrap.appendChild(fila);
    rivales.appendChild(wrap);
  });

  const humanoTurno = j.humano && revelado && !cargando;
  $("btn-robar-mazo").disabled = !(humanoTurno && fase === "robar");
  $("btn-robar-pila").disabled = !(humanoTurno && fase === "robar" && pila.length > 0);
  $("btn-descartar").disabled = !(humanoTurno && fase === "descartar" && seleccionado >= 0);
  $("btn-cortar").disabled = !(humanoTurno && fase === "descartar" && puedeCortar(seleccionado));
  $("btn-chinchon").disabled = !(humanoTurno && fase === "descartar" && puedeChinchon(seleccionado));
  $("btn-ordenar").disabled = !humanoTurno;

  let aviso = "";
  if (cargando && !j.humano) aviso = `${j.nombre} está pensando…`;
  else if (!j.humano) aviso = `Turno de ${j.nombre}`;
  else if (!revelado) aviso = `Turno de ${j.nombre}: revelá tu mano`;
  else if (fase === "robar") aviso = `Robá del mazo o de la pila · Tenés ${analizar(j.mano).puntos} pts sin combinar`;
  else if (fase === "descartar" && seleccionado >= 0) {
    const quedan = analizar(j.mano.filter((_, k) => k !== seleccionado)).puntos;
    aviso = puedeChinchon(seleccionado)
      ? "¡Es chinchón! Podés cerrar la ronda"
      : puedeCortar(seleccionado)
        ? `Si descartás esa carta te quedan ${quedan} pts: podés cortar`
        : `Si descartás esa carta te quedan ${quedan} pts sin combinar`;
  } else if (fase === "descartar") aviso = "Elegí una carta para descartar";
  $("aviso").textContent = aviso;

  $("tabla-jugadores").innerHTML = `<tbody>${jugadores.map((p, i) => `
    <tr class="${i === turno && !p.eliminado ? "turno" : ""} ${p.eliminado ? "eliminado" : ""}">
      <td>${p.nombre}${p.humano ? "" : " 🤖"}</td>
      <td>${p.total} pts</td>
      <td>${p.eliminado ? "fuera" : ""}</td>
    </tr>`).join("")}</tbody>`;
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
    const jugadoresCfg = Array.from({ length: n }, (_, i) => ({
      nombre: ($(`amigo-${i}`).value || `Jugador ${i + 1}`).trim().slice(0, 10),
      humano: true,
    }));
    return { modo: "amigos", jugadores: jugadoresCfg };
  }
  const bots = Number($("cant-bots").value);
  const humano = { nombre: ($("nombre-humano").value || "Vos").trim().slice(0, 10), humano: true };
  const lista = [humano];
  const dificultad = $("dificultad").value;
  for (let i = 1; i <= bots; i++) lista.push({ nombre: `Bot ${i}`, humano: false, dificultad });
  return { modo: "bots", jugadores: lista };
}

function init() {
  $("modo").onchange = () => {
    const amigos = $("modo").value === "amigos";
    $("cfg-amigos").classList.toggle("oculto", !amigos);
    $("cfg-bots").classList.toggle("oculto", amigos);
  };
  $("cant-amigos").onchange = renderSetupAmigos;
  renderSetupAmigos();

  $("btn-empezar").onclick = () => empezarPartido(leerConfiguracion());
  $("btn-robar-mazo").onclick = () => clicRobar("mazo");
  $("btn-robar-pila").onclick = () => clicRobar("pila");
  $("btn-descartar").onclick = clicDescartar;
  $("btn-cortar").onclick = clicCortar;
  $("btn-chinchon").onclick = clicChinchon;
  $("btn-ordenar").onclick = clicOrdenar;
  $("btn-reglas").onclick = clicReglas;
  $("btn-reglas-setup").onclick = clicReglas;
  $("btn-abandonar").onclick = abandonar;
  $("btn-revelar").onclick = () => {
    revelado = true;
    $("cortina").classList.add("oculto");
    render();
  };
  $("mano").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (btn) clicCarta(Number(btn.dataset.i));
  });

  $("btn-sonido").onclick = () => {
    Sonidos.alternar();
    $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  };
  $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  document.addEventListener("pointerdown", () => Sonidos.precargar(["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4", "card-place-1", "card-place-2", "card-shuffle"]), { once: true });
  renderRanking();
}

init();
