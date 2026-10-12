// Efectos visuales: partículas, texto flotante, destellos y banners.
const Fx = (() => {
  const lienzo = document.getElementById("fx");
  const c = lienzo.getContext("2d");
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let piezas = [];
  let corriendo = false;

  function ajustar() {
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = innerWidth * dpr;
    lienzo.height = innerHeight * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", ajustar);
  ajustar();

  function bucle() {
    c.clearRect(0, 0, innerWidth, innerHeight);
    piezas = piezas.filter((p) => p.vida > 0);
    for (const p of piezas) {
      p.vx *= 0.98;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vida -= p.decaimiento;
      c.globalAlpha = Math.max(0, p.vida);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    if (piezas.length) requestAnimationFrame(bucle);
    else corriendo = false;
  }

  function explotar(x, y, colores = ["#ffffff"], n = 24) {
    if (reducir) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 5;
      piezas.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1,
        g: 0.12,
        r: 2 + Math.random() * 3,
        vida: 1,
        decaimiento: 0.02 + Math.random() * 0.02,
        color: colores[i % colores.length],
      });
    }
    if (!corriendo) {
      corriendo = true;
      requestAnimationFrame(bucle);
    }
  }

  function explotarEn(el, colores) {
    const r = el.getBoundingClientRect();
    explotar(r.left + r.width / 2, r.top + r.height / 2, colores, 18);
  }

  function texto(msg, el, color = "#ffd166") {
    if (reducir) return;
    const r = el.getBoundingClientRect();
    const d = document.createElement("div");
    d.className = "popup";
    d.textContent = msg;
    d.style.color = color;
    d.style.left = r.left + r.width / 2 + "px";
    d.style.top = r.top + "px";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  function destello(color) {
    if (reducir) return;
    const d = document.getElementById("destello");
    d.style.background = color;
    d.classList.remove("on");
    void d.offsetWidth;
    d.classList.add("on");
  }

  function banner(msg) {
    const d = document.getElementById("banner");
    d.textContent = msg;
    d.classList.remove("on");
    void d.offsetWidth;
    d.classList.add("on");
  }

  return { explotar, explotarEn, texto, destello, banner };
})();
