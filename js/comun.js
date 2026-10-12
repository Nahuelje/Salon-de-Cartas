// Utilidades compartidas por todos los juegos del arcade.
// Cada página define RAIZ antes de cargar este archivo ("./" en el hub, "../../" en cada juego).
const $ = (id) => document.getElementById(id);

const Almacen = {
  leer(clave, def) {
    try {
      const v = localStorage.getItem(clave);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // Sin almacenamiento: el juego sigue funcionando sin guardar.
    }
  },
};

// Ranking por juego: top 10 guardado en este navegador.
const Ranking = {
  clave: (juego) => `arcade.ranking.${juego}`,
  top(juego) {
    return Almacen.leer(this.clave(juego), []);
  },
  // orden: "desc" (más puntos gana) o "asc" (menos puntos gana).
  agregar(juego, entrada, orden = "desc") {
    const lista = this.top(juego);
    lista.push({ ...entrada, fecha: new Date().toLocaleDateString("es-AR") });
    lista.sort((a, b) => (orden === "asc" ? a.puntos - b.puntos : b.puntos - a.puntos));
    const recortada = lista.slice(0, 10);
    Almacen.guardar(this.clave(juego), recortada);
    return recortada;
  },
  html(juego) {
    const lista = this.top(juego);
    if (lista.length === 0) return "<p class='pixel-chico'>Todavía no hay puntajes.</p>";
    return `<table class="tabla-ranking">
      <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Detalle</th></tr></thead>
      <tbody>${lista.map((r, i) => `<tr><td>${i + 1}</td><td>${r.nombre}</td><td>${r.puntos}</td><td>${r.detalle ?? ""}</td></tr>`).join("")}</tbody>
    </table>`;
  },
};

// Sonidos de cartas y fichas (assets CC0 de Kenney) con respaldo sintético.
const Sonidos = (() => {
  const CFG = "arcade.sonido";
  let efectos = Almacen.leer(CFG, true);
  let ctx = null;
  const buffers = {};

  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  async function cargar(nombre) {
    if (buffers[nombre] !== undefined) return buffers[nombre];
    buffers[nombre] = null;
    const c = contexto();
    if (!c) return null;
    try {
      const r = await fetch(`${RAIZ}assets/sonidos/${nombre}.ogg`);
      buffers[nombre] = await c.decodeAudioData(await r.arrayBuffer());
    } catch {
      // Si falla la carga se usa el respaldo sintético.
    }
    return buffers[nombre];
  }

  function beep(freq = 520, dur = 0.09, tipo = "triangle", vol = 0.15) {
    const c = contexto();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  return {
    precargar(lista) {
      lista.forEach((n) => cargar(n));
    },
    reproducir(nombre) {
      if (!efectos) return;
      const c = contexto();
      if (!c) return;
      const buf = buffers[nombre];
      if (buf) {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.connect(c.destination);
        s.start();
      } else {
        cargar(nombre);
        beep();
      }
    },
    // Elige una variante al azar: variante("card-slide", 8) toca card-slide-1..8.
    variante(base, n) {
      this.reproducir(`${base}-${1 + Math.floor(Math.random() * n)}`);
    },
    ganar() {
      if (!efectos) return;
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.18), i * 110));
    },
    perder() {
      if (!efectos) return;
      [330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.3, "sawtooth", 0.1), i * 220));
    },
    iniciar() {
      contexto();
    },
    get efectos() {
      return efectos;
    },
    alternar() {
      efectos = !efectos;
      Almacen.guardar(CFG, efectos);
      return efectos;
    },
  };
})();

// Modal genérico. La página debe tener los elementos #modal, #modal-titulo, #modal-texto, #modal-extra y #modal-btn.
const Modal = {
  abrir({ titulo, html = "", extra = "", boton = "OK", onBoton }) {
    $("modal-titulo").textContent = titulo;
    $("modal-texto").innerHTML = html;
    $("modal-extra").innerHTML = extra;
    const b = $("modal-btn");
    b.textContent = boton;
    b.onclick = () => {
      this.cerrar();
      if (onBoton) onBoton();
    };
    $("modal").classList.remove("oculto");
    b.focus();
  },
  cerrar() {
    $("modal").classList.add("oculto");
  },
};

// Efecto de sacudida para cualquier elemento.
function sacudirEl(el) {
  el.classList.remove("sacudir");
  void el.offsetWidth;
  el.classList.add("sacudir");
}
