// Baraja francesa del pack cards_v1_1 (PNG de 295 x 420 en assets/cartas).
// Los archivos se llaman "<rango>-<palo>.png": 7-H.png, K-S.png, A-D.png, 10-C.png...
const PALOS = ["corazones", "diamantes", "treboles", "picas"];
const CODIGO_PALO = { corazones: "H", diamantes: "D", treboles: "C", picas: "S" };

// Chinchón y casita se juegan con 40 cartas: sin 8, 9 y 10 (J, Q y K hacen de sota, caballo y rey).
const RANGOS_40 = ["A", "2", "3", "4", "5", "6", "7", "J", "Q", "K"];
// La memoria usa los 13 números del mazo.
const RANGOS_52 = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Dorso por defecto. El pack incluye: blue, black, yellow, green y red.
const DORSO = "blue";

// Proporción de los sprites (ancho x alto).
const CARTA_W = 295;
const CARTA_H = 420;

function archivoCarta(palo, rango) {
  return `${RAIZ}assets/cartas/${rango}-${CODIGO_PALO[palo]}.png`;
}

function archivoDorso() {
  return `${RAIZ}assets/cartas/back-${DORSO}.png`;
}

// Imagen de una carta boca arriba, con texto alternativo accesible.
function crearImagenCarta(palo, rango) {
  const img = document.createElement("img");
  img.src = archivoCarta(palo, rango);
  img.alt = `${rango} de ${palo}`;
  img.draggable = false;
  img.className = "img-carta";
  return img;
}

function crearImagenDorso() {
  const img = document.createElement("img");
  img.src = archivoDorso();
  img.alt = "Carta boca abajo";
  img.draggable = false;
  img.className = "img-carta";
  return img;
}

// Baraja con los rangos indicados.
function barajaCompleta(rangos) {
  const cartas = [];
  for (const palo of PALOS) for (const rango of rangos) cartas.push({ palo, rango });
  return cartas;
}

function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Animación de vuelo: una copia de la carta viaja del elemento "desde" al elemento "hacia".
// Es solo visual; el estado del juego ya cambió cuando se llama.
function volarCarta(desde, hacia, src, ms = 380) {
  if (!desde || !hacia || !src) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = desde.getBoundingClientRect();
  const b = hacia.getBoundingClientRect();
  // El tamaño de la carta que vuela es el de la imagen de origen, si existe.
  const ref = desde.tagName === "IMG" ? desde : desde.querySelector("img");
  const w = ref ? ref.getBoundingClientRect().width : 80;
  const h = (w * CARTA_H) / CARTA_W;
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.className = "img-carta";
  img.style.cssText = `position:fixed;left:${a.left + a.width / 2 - w / 2}px;top:${a.top + a.height / 2 - h / 2}px;` +
    `width:${w}px;height:${h}px;pointer-events:none;z-index:55;filter:drop-shadow(0 8px 12px rgba(0,0,0,.45));`;
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = img.animate(
    [{ transform: "translate(0, 0) rotate(0deg)" }, { transform: `translate(${dx}px, ${dy}px) rotate(8deg)` }],
    { duration: ms, easing: "ease-out" }
  );
  anim.onfinish = () => img.remove();
  anim.oncancel = () => img.remove();
}
