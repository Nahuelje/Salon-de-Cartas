// Póker Texas Hold'em contra bots, con ciegas crecientes, botes laterales y showdown.
const JUEGO_ID = "poker";
const MANOS_POR_NIVEL = 6;
const VALOR = { A: 14, K: 13, Q: 12, J: 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
const ETIQUETA = { 14: "A", 13: "K", 12: "Q", 11: "J" };
const etiqueta = (v) => ETIQUETA[v] || String(v);

// Ritmo del juego. Todos los tiempos base (en ms) se multiplican por el factor elegido.
const VELOCIDADES = { lento: { factor: 1.7, nombre: "Lenta" }, normal: { factor: 1, nombre: "Normal" }, rapido: { factor: 0.5, nombre: "Rápida" } };
let velocidad = Almacen.leer("poker.velocidad", "normal");
if (!VELOCIDADES[velocidad]) velocidad = "normal";
const t = (ms) => Math.round(ms * VELOCIDADES[velocidad].factor);

// ---------- Evaluación de manos ----------

// Devuelve un arreglo comparable: [categoría, desempates...]. Categorías: 0 carta alta ... 8 escalera de color.
function evaluar5(cs) {
  const v = cs.map((c) => VALOR[c.rango]).sort((a, b) => b - a);
  const color = cs.every((c) => c.palo === cs[0].palo);
  let alta = 0;
  if (new Set(v).size === 5) {
    if (v[0] - v[4] === 4) alta = v[0];
    else if (v[0] === 14 && v[1] === 5) alta = 5; // A-2-3-4-5
  }
  const cuenta = {};
  v.forEach((x) => (cuenta[x] = (cuenta[x] || 0) + 1));
  const grupos = Object.entries(cuenta)
    .map(([r, n]) => [n, Number(r)])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const patron = grupos.map((g) => g[0]).join("");
  const kick = grupos.map((g) => g[1]);
  if (alta && color) return [8, alta];
  if (patron === "41") return [7, ...kick];
  if (patron === "32") return [6, ...kick];
  if (color) return [5, ...v];
  if (alta) return [4, alta];
  if (patron === "311") return [3, ...kick];
  if (patron === "221") return [2, ...kick];
  if (patron === "2111") return [1, ...kick];
  return [0, ...v];
}

function comparar(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function combinaciones(arr, k) {
  const res = [];
  (function rec(ini, act) {
    if (act.length === k) {
      res.push([...act]);
      return;
    }
    for (let i = ini; i < arr.length; i++) {
      act.push(arr[i]);
      rec(i + 1, act);
      act.pop();
    }
  })(0, []);
  return res;
}

// Mejor mano de 5 cartas entre 5, 6 o 7.
function mejorMano(cartas) {
  let mejor = null;
  for (const combo of combinaciones(cartas, 5)) {
    const p = evaluar5(combo);
    if (!mejor || comparar(p, mejor.puntaje) > 0) mejor = { puntaje: p, cartas: combo };
  }
  return mejor;
}

function nombreMano(p) {
  const [c, a, b] = p;
  switch (c) {
    case 8: return a === 14 ? "Escalera real" : `Escalera de color hasta ${etiqueta(a)}`;
    case 7: return `Póker de ${etiqueta(a)}`;
    case 6: return `Full de ${etiqueta(a)} y ${etiqueta(b)}`;
    case 5: return `Color, ${etiqueta(a)} alta`;
    case 4: return `Escalera hasta ${etiqueta(a)}`;
    case 3: return `Trío de ${etiqueta(a)}`;
    case 2: return `Doble par de ${etiqueta(a)} y ${etiqueta(b)}`;
    case 1: return `Par de ${etiqueta(a)}`;
    default: return `Carta alta ${etiqueta(a)}`;
  }
}

// Descripción de lo que tenés, incluso con solo 2 o 3 cartas.
function descripcion(cartas) {
  if (cartas.length >= 5) return nombreMano(mejorMano(cartas).puntaje);
  const vals = cartas.map((c) => VALOR[c.rango]);
  const rep = vals.filter((v, i) => vals.indexOf(v) !== i);
  if (rep.length) return `Par de ${etiqueta(Math.max(...rep))}`;
  return `Carta alta ${etiqueta(Math.max(...vals))}`;
}

// ---------- Estado ----------

let jug = [];            // { nombre, humano, fichas, mano, apuesta, aportado, plegado, allIn, haActuado, eliminado, revelada, agresividad }
let mazo = [];
let comunes = [];
let bote = 0;
let boton = -1;
let apuestaActual = 0;
let incremento = 20;
let fase = "espera";     // espera | preflop | flop | turn | river | showdown
let turno = -1;
let manoNum = 0;
let manosGanadas = 0;
let ciegaPeq = 10;
let ciegaGrande = 20;
let fichasIniciales = 1000;
let activo = false;
let cargando = false;
let manoTerminada = true;
let ganadores = new Set();
let registro = [];
let pausa = "";          // mensaje mientras se reparte o se espera (bloquea las acciones)
let comunesVistas = 0;   // cuántas cartas comunes ya se animaron

const FASES_TXT = { espera: "-", preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
const humano = () => jug.find((j) => j.humano);
const vivos = () => jug.filter((j) => !j.eliminado);

function registrar(texto) {
  registro.unshift(texto);
  registro = registro.slice(0, 8);
}

// Siguiente jugador (en sentido horario) desde "desde" que cumpla la condición.
function siguienteDesde(desde, cond = (j) => !j.eliminado) {
  const n = jug.length;
  for (let k = 1; k <= n; k++) {
    const i = (desde + k) % n;
    if (cond(jug[i])) return i;
  }
  return -1;
}

// ---------- Partida ----------

function empezarPartida(cfg) {
  const nombres = ["Mati", "Lucía", "Fede", "Sofi"];
  jug = [{ nombre: cfg.nombre, humano: true, fichas: cfg.fichas }];
  for (let i = 0; i < cfg.bots; i++) {
    jug.push({ nombre: nombres[i], humano: false, fichas: cfg.fichas, agresividad: 0.85 + Math.random() * 0.4 });
  }
  jug.forEach((j) => Object.assign(j, { mano: [], apuesta: 0, aportado: 0, plegado: false, allIn: false, haActuado: false, eliminado: false, revelada: false }));
  fichasIniciales = cfg.fichas;
  ciegaPeq = Math.max(5, Math.round(cfg.fichas / 100));
  ciegaGrande = ciegaPeq * 2;
  manoNum = 0;
  manosGanadas = 0;
  boton = jug.length - 1; // la primera mano el botón pasa al jugador 0
  registro = [];
  activo = true;
  $("setup").classList.add("oculto");
  $("juego").classList.remove("oculto");
  Sonidos.iniciar();
  Sonidos.reproducir("card-shuffle");
  iniciarMano();
}

function poner(j, monto) {
  const m = Math.max(0, Math.min(monto, j.fichas));
  j.fichas -= m;
  j.apuesta += m;
  j.aportado += m;
  bote += m;
  if (j.fichas === 0) j.allIn = true;
  // Las fichas "viajan" al bote: un +monto flota sobre el bote.
  if (m > 0) Fx.texto(`+${m}`, $("bote"), "#e8c15a");
  return m;
}

function iniciarMano() {
  jug.forEach((j) => {
    j.mano = [];
    j.apuesta = 0;
    j.aportado = 0;
    j.plegado = j.eliminado;
    j.allIn = false;
    j.haActuado = false;
    j.revelada = false;
    j.ultima = "";
  });
  ganadores = new Set();
  if (vivos().length < 2) return finTorneo();

  manoNum++;
  // Las ciegas suben cada MANOS_POR_NIVEL manos.
  if (manoNum > 1 && (manoNum - 1) % MANOS_POR_NIVEL === 0) {
    ciegaPeq *= 2;
    ciegaGrande *= 2;
    registrar(`⬆ Suben las ciegas a ${ciegaPeq}/${ciegaGrande}.`);
    Fx.banner(`CIEGAS ${ciegaPeq}/${ciegaGrande}`);
  }

  mazo = mezclar(barajaCompleta(RANGOS_52));
  comunes = [];
  bote = 0;
  boton = siguienteDesde(boton);

  const enMesa = vivos();
  for (let r = 0; r < 2; r++) enMesa.forEach((j) => j.mano.push(mazo.pop()));
  Sonidos.variante("card-slide", 8);

  // Mano a mano: el botón pone la ciega chica y actúa primero.
  const mano_a_mano = enMesa.length === 2;
  const sb = mano_a_mano ? boton : siguienteDesde(boton);
  const bb = siguienteDesde(sb);
  poner(jug[sb], ciegaPeq);
  poner(jug[bb], ciegaGrande);
  apuestaActual = ciegaGrande;
  incremento = ciegaGrande;
  fase = "preflop";
  manoTerminada = false;
  registrar(`Mano ${manoNum}: ${jug[sb].nombre} pone ${ciegaPeq} y ${jug[bb].nombre} pone ${ciegaGrande}.`);

  turno = mano_a_mano ? sb : siguienteDesde(bb, (j) => !j.plegado && !j.allIn);
  if (!jug[turno] || jug[turno].allIn) return terminarRonda();

  // Reparto animado: las cartas salen del centro hacia cada asiento y recién después se empieza a apostar.
  comunesVistas = 0;
  pausa = "Repartiendo cartas…";
  cargando = true;
  render();
  repartirAnimado();
  setTimeout(iniciarTurno, t(160) * enMesa.length * 2 + t(700));
}

// Dos cartas por jugador viajan desde el bote hasta cada asiento, de a una.
function repartirAnimado() {
  const destinos = [...document.querySelectorAll("#rivales .asiento:not(.fuera)"), $("mi-asiento")];
  destinos.forEach((el, k) => {
    for (let c = 0; c < 2; c++) {
      setTimeout(() => {
        Sonidos.variante("card-slide", 8);
        volarCarta($("bote"), el, archivoDorso(), t(380));
      }, t(160) * (c * destinos.length + k));
    }
  });
}

function iniciarTurno() {
  const j = jug[turno];
  pausa = "";
  if (j.humano) {
    cargando = false;
    render();
  } else {
    cargando = true;
    render();
    const idx = turno;
    // Los bots "piensan" entre 1,3 y 2 segundos (según la velocidad elegida).
    setTimeout(() => jugarBot(idx), t(1300 + Math.random() * 700));
  }
}

// accion: "plegar" | "igualar" | "subir" (monto = total de apuesta objetivo en la ronda)
function aplicarAccion(idx, accion, monto = 0) {
  const j = jug[idx];
  if (accion === "plegar") {
    j.plegado = true;
    j.ultima = "Se retira";
    registrar(`${j.nombre} se retira.`);
    Sonidos.variante("card-shove", 4);
  } else if (accion === "igualar") {
    const m = poner(j, apuestaActual - j.apuesta);
    j.ultima = m === 0 ? "Pasa" : `Iguala ${m}`;
    registrar(m === 0 ? `${j.nombre} pasa.` : `${j.nombre} iguala ${m}${j.allIn ? " (all-in)" : ""}.`);
    if (m > 0) Sonidos.reproducir("chip-lay-1");
    else Sonidos.variante("card-slide", 8);
  } else {
    const objetivo = Math.min(monto, j.apuesta + j.fichas);
    const antes = apuestaActual;
    poner(j, objetivo - j.apuesta);
    if (j.apuesta > apuestaActual) {
      incremento = Math.max(ciegaGrande, j.apuesta - antes);
      apuestaActual = j.apuesta;
      jug.forEach((o) => {
        if (o !== j && !o.plegado && !o.allIn) o.haActuado = false;
      });
    }
    const verbo = j.apuesta <= antes ? "iguala" : antes === 0 ? "apuesta" : "sube a";
    j.ultima = `${verbo.charAt(0).toUpperCase()}${verbo.slice(1)} ${j.apuesta}`;
    registrar(`${j.nombre} ${verbo} ${j.apuesta}${j.allIn ? " (all-in)" : ""}.`);
    Sonidos.reproducir("chips-stack-1");
  }
  j.haActuado = true;
  avanzar();
}

function avanzar() {
  const enJuego = jug.filter((j) => !j.plegado);
  if (enJuego.length === 1) return ganarSinShowdown(enJuego[0]);
  const pendientes = enJuego.filter((j) => !j.allIn && (!j.haActuado || j.apuesta < apuestaActual));
  if (pendientes.length === 0) {
    // Se deja ver la última jugada un momento antes de pasar a la calle siguiente.
    cargando = true;
    render();
    setTimeout(terminarRonda, t(900));
    return;
  }
  turno = siguienteDesde(turno, (j) => pendientes.includes(j));
  iniciarTurno();
}

function terminarRonda() {
  jug.forEach((j) => {
    j.apuesta = 0;
    j.haActuado = false;
    j.ultima = "";
  });
  apuestaActual = 0;
  incremento = ciegaGrande;
  if (fase === "river") return showdown();

  const enJuego = jug.filter((j) => !j.plegado);
  const puedenActuar = enJuego.filter((j) => !j.allIn);

  if (fase === "preflop") {
    comunes.push(mazo.pop(), mazo.pop(), mazo.pop());
    fase = "flop";
  } else if (fase === "flop") {
    comunes.push(mazo.pop());
    fase = "turn";
  } else if (fase === "turn") {
    comunes.push(mazo.pop());
    fase = "river";
  }
  Sonidos.variante("card-place", 4);

  const nuevas = fase === "flop" ? 3 : 1;
  const nombreFase = { flop: "el flop", turn: "el turn", river: "el river" }[fase];

  if (puedenActuar.length <= 1) {
    // Nadie puede apostar más: se muestran las cartas y se corre el resto del tablero, de a una calle por vez.
    enJuego.forEach((j) => (j.revelada = true));
    pausa = `Se reparte ${nombreFase}…`;
    cargando = true;
    render();
    setTimeout(terminarRonda, t(1800 + 300 * nuevas));
    return;
  }

  // Pausa para ver las cartas nuevas antes de volver a apostar.
  pausa = `Se reparte ${nombreFase}…`;
  cargando = true;
  render();
  setTimeout(() => {
    turno = siguienteDesde(boton, (j) => !j.plegado && !j.allIn);
    iniciarTurno();
  }, t(800 + 300 * nuevas));
}

// ---------- Resolución de la mano ----------

function repartirBote(ganador, monto) {
  ganador.fichas += monto;
}

function ganarSinShowdown(j) {
  manoTerminada = true;
  fase = "showdown";
  ganadores = new Set([j]);
  const monto = bote;
  repartirBote(j, monto);
  bote = 0;
  if (j.humano) manosGanadas++;
  registrar(`${j.nombre} gana ${monto} (todos se retiraron).`);
  Sonidos.reproducir("chips-stack-1");
  render();
  cerrarMano([{ nombre: j.nombre, monto, texto: "Todos se retiraron" }], []);
}

function showdown() {
  manoTerminada = true;
  fase = "showdown";
  const enJuego = jug.filter((j) => !j.plegado);
  enJuego.forEach((j) => {
    j.revelada = true;
    j.resultado = mejorMano([...j.mano, ...comunes]);
  });

  // Botes principal y laterales, por niveles de aporte.
  const niveles = [...new Set(jug.filter((j) => j.aportado > 0).map((j) => j.aportado))].sort((a, b) => a - b);
  let previo = 0;
  const botes = [];
  for (const nivel of niveles) {
    const monto = jug.reduce((s, j) => s + Math.max(0, Math.min(j.aportado, nivel) - previo), 0);
    const elegibles = enJuego.filter((j) => j.aportado >= nivel);
    if (monto > 0 && elegibles.length) botes.push({ monto, elegibles });
    else if (monto > 0 && botes.length) botes[botes.length - 1].monto += monto;
    previo = nivel;
  }

  const premios = [];
  botes.forEach((b, n) => {
    let mejor = b.elegibles[0];
    b.elegibles.forEach((j) => {
      if (comparar(j.resultado.puntaje, mejor.resultado.puntaje) > 0) mejor = j;
    });
    const ganan = b.elegibles.filter((j) => comparar(j.resultado.puntaje, mejor.resultado.puntaje) === 0);
    const parte = Math.floor(b.monto / ganan.length);
    ganan.forEach((j, k) => {
      const extra = k === 0 ? b.monto - parte * ganan.length : 0;
      j.fichas += parte + extra;
      ganadores.add(j);
      premios.push({ nombre: j.nombre, monto: parte + extra, texto: nombreMano(j.resultado.puntaje), lateral: n > 0 });
    });
  });
  bote = 0;
  if ([...ganadores].some((j) => j.humano)) manosGanadas++;
  registrar(`Showdown: ${[...ganadores].map((j) => j.nombre).join(" y ")} se lleva${ganadores.size > 1 ? "n" : ""} el bote.`);
  Sonidos.reproducir("chips-stack-1");
  render();
  cerrarMano(premios, enJuego);
}

function cerrarMano(premios, mostrados) {
  cargando = true;
  const gano = [...ganadores].some((j) => j.humano);
  if (gano) {
    Sonidos.ganar();
    if (window.confetti) confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
  }

  // Resumen con las cartas de quienes llegaron al showdown.
  const filas = mostrados.map((j) => {
    const cartas = j.mano.map((c) => `<img class="img-carta" src="${archivoCarta(c.palo, c.rango)}" alt="${c.rango} de ${c.palo}">`).join("");
    return `<div class="fila${ganadores.has(j) ? " gana" : ""}"><strong>${j.nombre}</strong><span>${cartas}</span><span>${nombreMano(j.resultado.puntaje)}</span></div>`;
  }).join("");
  const resumen = premios.map((p) => `<p><strong>${p.nombre}</strong> gana <strong>${p.monto}</strong>${p.lateral ? " (bote lateral)" : ""} · ${p.texto}</p>`).join("");

  setTimeout(() => {
    Modal.abrir({
      titulo: gano ? "¡Ganaste la mano!" : `Gana ${[...ganadores].map((j) => j.nombre).join(" y ")}`,
      html: `${resumen}<div class="showdown">${filas}</div>`,
      boton: "Siguiente mano",
      onBoton: () => {
        // Eliminación de quienes se quedaron sin fichas.
        jug.forEach((j) => {
          if (!j.eliminado && j.fichas <= 0) {
            j.eliminado = true;
            registrar(`${j.nombre} queda eliminado.`);
          }
        });
        const yo = humano();
        if (yo.eliminado || vivos().length < 2) return finTorneo();
        iniciarMano();
      },
    });
  }, t(1800)); // tiempo para ver las cartas de todos antes del resumen
}

function finTorneo() {
  activo = false;
  const yo = humano();
  const campeon = !yo.eliminado && vivos().length === 1;
  const puntos = Math.max(0, yo.fichas) + manosGanadas * 100 + (campeon ? 3000 : 0);
  Sonidos[campeon ? "ganar" : "perder"]();
  if (campeon) Fx.banner("¡CAMPEÓN!");
  Modal.abrir({
    titulo: campeon ? "¡Ganaste el torneo!" : "Fin de la partida",
    html: `<p>${campeon ? "Te quedaste con todas las fichas." : "Te quedaste sin fichas."}</p>
      <p>Manos jugadas: <strong>${manoNum}</strong> · Manos ganadas: <strong>${manosGanadas}</strong> · Puntos: <strong>${puntos}</strong></p>
      <p>Escribí tus iniciales para el ranking:</p>`,
    extra: `<input id="nombre-ranking" maxlength="3" autocomplete="off" placeholder="ABC">`,
    boton: "Guardar",
    onBoton: () => {
      const nombre = ($("nombre-ranking")?.value || "").trim().toUpperCase().slice(0, 3) || "ANON";
      Ranking.agregar(JUEGO_ID, { nombre, puntos, detalle: `${manoNum} manos · ${manosGanadas} ganadas` });
      renderRanking();
      $("juego").classList.add("oculto");
      $("setup").classList.remove("oculto");
    },
  });
}

// ---------- Bots ----------

function fuerzaPreflop(h) {
  const a = VALOR[h[0].rango];
  const b = VALOR[h[1].rango];
  const alto = Math.max(a, b);
  const bajo = Math.min(a, b);
  if (a === b) return 0.55 + ((a - 2) / 12) * 0.35;
  let f = 0.2 + ((alto + bajo - 5) / 22) * 0.55;
  if (h[0].palo === h[1].palo) f += 0.05;
  if (alto - bajo <= 2) f += 0.04;
  return Math.min(0.95, f);
}

function fuerzaPostflop(j) {
  const todas = [...j.mano, ...comunes];
  const mio = mejorMano(todas);
  const cat = mio.puntaje[0];
  const base = [0.18, 0.45, 0.7, 0.8, 0.88, 0.9, 0.95, 1, 1][cat];
  let f = base;
  if (cat === 0) f = 0.1 + (mio.puntaje[1] / 14) * 0.12;
  if (cat === 1) f = 0.38 + (mio.puntaje[1] / 14) * 0.18;
  // Si el tablero solo ya da esa misma mano, la ventaja es menor.
  if (comunes.length >= 5 && comparar(mejorMano(comunes).puntaje, mio.puntaje) === 0) f *= 0.6;
  return Math.min(1, f);
}

function redondear(x) {
  return Math.max(5, Math.round(x / 5) * 5);
}

function jugarBot(idx) {
  if (!activo || manoTerminada || turno !== idx) return;
  const j = jug[idx];
  const falta = apuestaActual - j.apuesta;
  let f = fase === "preflop" ? fuerzaPreflop(j.mano) : fuerzaPostflop(j);
  f = f * j.agresividad + (Math.random() - 0.5) * 0.12;
  const odds = falta / (bote + falta || 1);
  const tamanio = () => {
    const objetivo = apuestaActual + Math.max(incremento, redondear(bote * (0.5 + Math.random() * 0.5)));
    return Math.min(objetivo, j.apuesta + j.fichas);
  };

  let accion = "igualar";
  let monto = 0;
  if (falta === 0) {
    if (f > 0.7 && Math.random() < 0.75) { accion = "subir"; monto = tamanio(); }
    else if (f > 0.5 && Math.random() < 0.35) { accion = "subir"; monto = tamanio(); }
    else if (Math.random() < 0.05) { accion = "subir"; monto = tamanio(); }
  } else if (f > 0.82 && Math.random() < 0.6) {
    accion = "subir";
    monto = tamanio();
  } else if (f > odds + 0.12 || (falta <= ciegaGrande && f > 0.3) || Math.random() < 0.04) {
    accion = "igualar";
  } else {
    accion = "plegar";
  }
  cargando = false;
  aplicarAccion(idx, accion, monto);
}

// ---------- Acciones del humano ----------

const miTurno = () => activo && !manoTerminada && !cargando && jug[turno] && jug[turno].humano && ["preflop", "flop", "turn", "river"].includes(fase);

function minimoSubir(j) {
  const minimo = apuestaActual === 0 ? ciegaGrande : apuestaActual + incremento;
  return Math.min(minimo, j.apuesta + j.fichas);
}

function clicPlegar() {
  if (!miTurno()) return;
  aplicarAccion(turno, "plegar");
}

function clicIgualar() {
  if (!miTurno()) return;
  aplicarAccion(turno, "igualar");
}

function clicSubir() {
  if (!miTurno()) return;
  aplicarAccion(turno, "subir", Number($("monto").value));
}

function rapido(tipo) {
  if (!miTurno()) return;
  const j = jug[turno];
  const tope = j.apuesta + j.fichas;
  let v = minimoSubir(j);
  if (tipo === "medio") v = apuestaActual + redondear(bote * 0.5);
  if (tipo === "bote") v = apuestaActual + redondear(bote);
  if (tipo === "todo") v = tope;
  v = Math.max(minimoSubir(j), Math.min(v, tope));
  $("monto").value = v;
  $("monto-salida").textContent = v;
}

// ---------- Render ----------

function htmlCartas(cartas, ocultas) {
  return cartas
    .map((c) => (ocultas ? `<img class="img-carta" src="${archivoDorso()}" alt="Carta oculta">`
      : `<img class="img-carta" src="${archivoCarta(c.palo, c.rango)}" alt="${c.rango} de ${c.palo}">`))
    .join("");
}

function render() {
  if (!jug.length) return;
  const yo = humano();
  const enTurno = jug[turno];
  $("s-mano").textContent = manoNum;
  $("s-fase").textContent = FASES_TXT[fase] || "-";
  $("s-ciegas").textContent = `${ciegaPeq}/${ciegaGrande}`;
  $("bote").textContent = `Bote: ${bote}`;

  // Rivales.
  $("rivales").innerHTML = jug
    .map((j, i) => {
      if (j.humano) return "";
      // Se muestra la última jugada de cada rival (Pasa, Iguala 40, Sube a 90...) hasta que cambie la ronda.
      const estado = j.eliminado ? "Eliminado"
        : j.plegado ? "Retirado"
        : j.ultima ? `${j.ultima}${j.allIn ? " · All-in" : ""}`
        : j.allIn ? "All-in"
        : j.apuesta ? `Apuesta ${j.apuesta}` : " ";
      const mostrar = !j.eliminado && j.mano.length > 0 && !j.plegado;
      const clases = ["asiento"];
      if (j.eliminado) clases.push("fuera");
      if (j.plegado && !j.eliminado) clases.push("plegado");
      if (i === turno && !manoTerminada && activo) clases.push("turno");
      if (ganadores.has(j)) clases.push("ganador");
      return `<div class="${clases.join(" ")}">
        <div class="nombre">${j.nombre}${i === boton && !j.eliminado ? '<span class="boton-d" title="Botón">D</span>' : ""}</div>
        <div class="fichas">🪙 ${j.fichas}</div>
        <div class="cartas">${mostrar ? htmlCartas(j.mano, !j.revelada) : ""}</div>
        <div class="estado">${estado}</div>
      </div>`;
    })
    .join("");

  // Mesa.
  // Las cartas comunes nuevas entran de a una, con un pequeño retraso entre cada una.
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const c = comunes[i];
    if (!c) {
      slots.push('<div class="hueco"></div>');
      continue;
    }
    const nueva = i >= comunesVistas;
    const demora = nueva ? t(350) * (i - comunesVistas) : 0;
    slots.push(`<img class="img-carta${nueva ? " repartida" : ""}" ${nueva ? `style="animation-delay:${demora}ms"` : ""} src="${archivoCarta(c.palo, c.rango)}" alt="${c.rango} de ${c.palo}">`);
  }
  $("comunes").innerHTML = slots.join("");
  comunesVistas = comunes.length;

  // Mi asiento.
  $("mi-nombre").textContent = `${yo.nombre}${jug.indexOf(yo) === boton ? " (botón)" : ""}`;
  $("mis-fichas").textContent = `🪙 ${yo.fichas}`;
  $("mi-apuesta").textContent = yo.apuesta ? `Apuesta: ${yo.apuesta}` : "";
  // Mientras se reparte, tus cartas se ven boca abajo; después se dan vuelta.
  const repartiendo = pausa.startsWith("Repartiendo");
  $("mis-cartas").innerHTML = yo.mano.length && !yo.eliminado ? htmlCartas(yo.mano, repartiendo) : "";
  const jugada = yo.mano.length && !yo.eliminado && !repartiendo ? descripcion([...yo.mano, ...comunes]) : "";
  $("mi-jugada").textContent = yo.plegado && !yo.eliminado ? "Te retiraste de esta mano" : jugada ? `Tenés: ${jugada}` : "";
  $("mi-asiento").classList.toggle("turno", miTurno());

  // Aviso.
  let aviso = "";
  if (!activo) aviso = "";
  else if (manoTerminada) aviso = "Mano terminada";
  else if (pausa) aviso = pausa;
  else if (miTurno()) {
    const falta = apuestaActual - yo.apuesta;
    aviso = falta > 0 ? `Tu turno: para seguir tenés que poner ${Math.min(falta, yo.fichas)}.` : "Tu turno: podés pasar o apostar.";
  } else if (enTurno) aviso = `${enTurno.nombre} está pensando…`;
  $("aviso").textContent = aviso;

  // Botones de acción.
  const puedo = miTurno();
  const falta = Math.max(0, apuestaActual - yo.apuesta);
  $("btn-plegar").disabled = !puedo;
  $("btn-igualar").disabled = !puedo;
  $("btn-igualar").textContent = falta === 0 ? "Pasar" : falta >= yo.fichas ? `All-in ${yo.fichas}` : `Igualar ${falta}`;

  const tope = yo.apuesta + yo.fichas;
  const minimo = minimoSubir(yo);
  const puedeSubir = puedo && tope > apuestaActual;
  const rango = $("monto");
  rango.min = minimo;
  rango.max = Math.max(minimo, tope);
  rango.step = Math.max(1, Math.min(5, ciegaPeq));
  if (puedeSubir) {
    const actual = Number(rango.value);
    if (!actual || actual < minimo || actual > tope) rango.value = minimo;
  } else {
    rango.value = minimo;
  }
  $("monto-salida").textContent = rango.value;
  rango.disabled = !puedeSubir;
  $("btn-subir").disabled = !puedeSubir;
  $("btn-subir").textContent = apuestaActual === 0 ? "Apostar" : "Subir a";
  document.querySelectorAll("[data-rapido]").forEach((b) => (b.disabled = !puedeSubir));

  $("registro").innerHTML = registro.length ? registro.map((t) => `<li>${t}</li>`).join("") : "<li>Todavía no hubo jugadas.</li>";
}

function renderRanking() {
  $("ranking").innerHTML = Ranking.html(JUEGO_ID);
}

function abandonar() {
  if (!activo) return;
  if (!confirm("¿Abandonar la partida? Se pierde el progreso.")) return;
  activo = false;
  cargando = false;
  manoTerminada = true;
  Modal.cerrar();
  $("juego").classList.add("oculto");
  $("setup").classList.remove("oculto");
}

const GUIA = `
  <ol class="guia">
    <li><strong>Escalera real:</strong> 10-J-Q-K-A del mismo palo.</li>
    <li><strong>Escalera de color:</strong> cinco cartas seguidas del mismo palo.</li>
    <li><strong>Póker:</strong> cuatro cartas del mismo número.</li>
    <li><strong>Full:</strong> un trío y un par.</li>
    <li><strong>Color:</strong> cinco cartas del mismo palo.</li>
    <li><strong>Escalera:</strong> cinco cartas seguidas de distinto palo.</li>
    <li><strong>Trío:</strong> tres cartas del mismo número.</li>
    <li><strong>Doble par:</strong> dos pares distintos.</li>
    <li><strong>Par:</strong> dos cartas del mismo número.</li>
    <li><strong>Carta alta:</strong> ninguna combinación; gana la carta más alta.</li>
  </ol>
  <p class="pixel-chico">Ordenadas de la más fuerte a la más débil. El as vale como la carta más alta o como 1 en A-2-3-4-5.</p>`;

function init() {
  $("btn-empezar").onclick = () => {
    empezarPartida({
      bots: Number($("cant-bots").value),
      fichas: Number($("fichas").value),
      nombre: ($("nombre").value || "Vos").trim().slice(0, 10),
    });
  };
  $("btn-plegar").onclick = clicPlegar;
  $("btn-igualar").onclick = clicIgualar;
  $("btn-subir").onclick = clicSubir;
  $("btn-abandonar").onclick = abandonar;
  $("btn-guia").onclick = () => Modal.abrir({ titulo: "Manos de póker", html: GUIA, boton: "Entendido" });

  // Velocidad del juego: Lenta / Normal / Rápida (se recuerda entre partidas).
  const textoVelocidad = () => ($("btn-velocidad").textContent = `Velocidad: ${VELOCIDADES[velocidad].nombre}`);
  $("btn-velocidad").onclick = () => {
    const orden = ["lento", "normal", "rapido"];
    velocidad = orden[(orden.indexOf(velocidad) + 1) % orden.length];
    Almacen.guardar("poker.velocidad", velocidad);
    textoVelocidad();
  };
  textoVelocidad();
  $("monto").addEventListener("input", () => ($("monto-salida").textContent = $("monto").value));
  document.querySelectorAll("[data-rapido]").forEach((b) => (b.onclick = () => rapido(b.dataset.rapido)));

  $("btn-sonido").onclick = () => {
    Sonidos.alternar();
    $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  };
  $("btn-sonido").textContent = Sonidos.efectos ? "Sonido: on" : "Sonido: off";
  document.addEventListener("pointerdown", () => Sonidos.precargar(["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4", "card-slide-5", "card-slide-6", "card-slide-7", "card-slide-8", "card-place-1", "card-place-2", "card-shove-1", "card-shove-2", "chip-lay-1", "chips-stack-1", "card-shuffle"]), { once: true });
  renderRanking();
}

init();
