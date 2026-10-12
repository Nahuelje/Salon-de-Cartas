// Memoria de números: encontrá los pares de cartas con el mismo número.
const JUEGO_ID = "memoria";
const NIVELES = [2, 3, 4, 5, 6, 8, 10, 12]; // pares por nivel (el mazo tiene 13 números distintos)
const RANGOS = RANGOS_52;
const COLUMNAS = { 4: 4, 6: 3, 8: 4, 10: 5, 12: 4, 16: 4, 20: 5, 24: 6 };

let nivel = 0;
let cartas = [];
let elementos = [];
let primera = null;
let bloqueado = false;
let activo = false;
let combo = 0;
let puntos = 0;
let fallos = 0;
let aciertos = 0;
let segundos = 0;
let reloj = null;

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function actualizarStats() {
  const total = cartas.length / 2;
  $("s-nivel").textContent = activo || nivel > 0 ? `${nivel + 1}/${NIVELES.length}` : "-";
  $("s-pares").textContent = `${aciertos}/${total || 0}`;
  $("s-puntos").textContent = puntos;
  $("s-fallos").textContent = fallos;
  $("s-tiempo").textContent = mmss(segundos);
}

function clasesCarta(i) {
  const c = cartas[i];
  return "carta" + (c.volteada ? " volteada" : "") + (c.emparejada ? " emparejada" : "");
}

function actualizarCarta(i) {
  elementos[i].className = clasesCarta(i);
}

function empezarNivel() {
  const pares = NIVELES[nivel];
  const rangos = mezclar(RANGOS).slice(0, pares);
  const nuevas = [];
  for (const r of rangos) {
    const palos = mezclar(PALOS).slice(0, 2);
    for (const palo of palos) nuevas.push({ palo, rango: r, volteada: false, emparejada: false });
  }
  cartas = mezclar(nuevas);
  primera = null;
  bloqueado = false;
  aciertos = 0;
  combo = 0;
  renderTablero();
  actualizarStats();
}

function renderTablero() {
  const tab = $("tablero");
  // Ancho de carta según la cantidad de cartas y el dispositivo (la altura sale de la proporción 295:420).
  const movil = window.innerWidth <= 720;
  const ancho = movil ? 72 : cartas.length > 12 ? 92 : 120;
  const cols = movil ? 4 : COLUMNAS[cartas.length];
  tab.style.setProperty("--carta-w", `${ancho}px`);
  tab.style.setProperty("--carta-h", `${Math.round((ancho * CARTA_H) / CARTA_W)}px`);
  tab.style.gridTemplateColumns = `repeat(${cols}, var(--carta-w))`;
  tab.innerHTML = "";
  elementos = cartas.map((c, i) => {
    const el = document.createElement("div");
    el.dataset.i = i;
    el.className = clasesCarta(i);
    el.innerHTML = `<div class="carta-in">
      <div class="cara dorso"><img class="img-carta" src="${archivoDorso()}" alt="Carta boca abajo" draggable="false"></div>
      <div class="cara frente"></div>
    </div>`;
    el.querySelector(".frente").appendChild(crearImagenCarta(c.palo, c.rango));
    tab.appendChild(el);
    return el;
  });
}

function clicCarta(i) {
  if (!activo || bloqueado) return;
  const c = cartas[i];
  if (c.volteada || c.emparejada) return;

  c.volteada = true;
  actualizarCarta(i);
  Sonidos.variante("card-slide", 8);

  if (primera === null) {
    primera = i;
    return;
  }

  const a = primera;
  primera = null;

  if (cartas[a].rango === c.rango) {
    cartas[a].emparejada = true;
    c.emparejada = true;
    combo++;
    puntos += 100 + 25 * (combo - 1);
    aciertos++;
    actualizarCarta(a);
    actualizarCarta(i);
    Sonidos.reproducir("chip-lay-1");
    Fx.explotarEn(elementos[a], ["#5ee07a", "#ffffff", "#ffcc29"]);
    Fx.explotarEn(elementos[i], ["#5ee07a", "#ffffff", "#ffcc29"]);
    if (combo >= 3) Fx.banner(`COMBO x${combo}!`);
    actualizarStats();
    if (cartas.every((x) => x.emparejada)) return nivelCompleto();
  } else {
    combo = 0;
    fallos++;
    puntos = Math.max(0, puntos - 10);
    bloqueado = true;
    Sonidos.variante("card-shove", 4);
    Fx.destello("rgba(255, 92, 108, .2)");
    actualizarStats();
    setTimeout(() => {
      cartas[a].volteada = false;
      c.volteada = false;
      actualizarCarta(a);
      actualizarCarta(i);
      bloqueado = false;
    }, 900);
  }
}

function nivelCompleto() {
  activo = false;
  clearInterval(reloj);
  const bono = 150 * (nivel + 1);
  puntos += bono;
  actualizarStats();
  Sonidos.ganar();
  Fx.banner(`NIVEL ${nivel + 1} ✔`);

  if (nivel + 1 >= NIVELES.length) {
    return finJuego(`¡Terminaste los ${NIVELES.length} niveles!`);
  }
  Modal.abrir({
    titulo: `Nivel ${nivel + 1} completo`,
    html: `<p>Bono de nivel: +${bono} puntos.</p><p>Siguiente: ${NIVELES[nivel + 1]} pares.</p>`,
    boton: "Siguiente nivel",
    onBoton: () => {
      nivel++;
      activo = true;
      empezarNivel();
      iniciarReloj();
    },
  });
}

function iniciarReloj() {
  clearInterval(reloj);
  reloj = setInterval(() => {
    if (!activo) return;
    segundos++;
    $("s-tiempo").textContent = mmss(segundos);
  }, 1000);
}

function iniciarJuego() {
  Sonidos.iniciar();
  nivel = 0;
  puntos = 0;
  fallos = 0;
  segundos = 0;
  activo = true;
  $("btn-empezar").classList.add("oculto");
  $("btn-terminar").classList.remove("oculto");
  empezarNivel();
  iniciarReloj();
}

function finJuego(titulo) {
  activo = false;
  clearInterval(reloj);
  $("btn-terminar").classList.add("oculto");
  Sonidos.ganar();
  Modal.abrir({
    titulo,
    html: `<p>Puntos: <strong>${puntos}</strong> · Fallos: ${fallos} · Tiempo: ${mmss(segundos)}</p>
      <p>Escribí tus iniciales para el ranking:</p>`,
    extra: `<input id="nombre-ranking" maxlength="3" autocomplete="off" placeholder="ABC">`,
    boton: "Guardar",
    onBoton: () => {
      const nombre = ($("nombre-ranking")?.value || "").trim().toUpperCase().slice(0, 3) || "ANON";
      Ranking.agregar(JUEGO_ID, { nombre, puntos, detalle: `Nivel ${nivel + 1} · ${mmss(segundos)}` });
      renderRanking();
      $("btn-empezar").classList.remove("oculto");
      actualizarStats();
    },
  });
}

function terminarAhora() {
  if (!activo) return;
  finJuego("Partida terminada");
}

function renderRanking() {
  $("ranking").innerHTML = Ranking.html(JUEGO_ID);
}

function init() {
  $("tablero").addEventListener("click", (e) => {
    const el = e.target.closest(".carta");
    if (el) clicCarta(Number(el.dataset.i));
  });
  $("btn-empezar").onclick = iniciarJuego;
  $("btn-terminar").onclick = terminarAhora;
  $("btn-sonido").onclick = () => {
    Sonidos.alternar();
    $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  };
  $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  document.addEventListener("pointerdown", () => Sonidos.precargar(["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4", "card-slide-5", "card-slide-6", "card-slide-7", "card-slide-8", "card-shove-1", "card-shove-2", "chip-lay-1"]), { once: true });
  renderRanking();
  actualizarStats();
}

init();
