// Servidor estático 
const http = require("http");
const fs = require("fs");
const path = require("path");

const raiz = __dirname;
const tipos = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
const puerto = process.env.PORT || 8080;

http.createServer((req, res) => {
  const ruta = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const archivo = path.join(raiz, ruta);
  if (!archivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404).end("No encontrado"); return; }
    res.writeHead(200, { "Content-Type": tipos[path.extname(archivo)] || "application/octet-stream" });
    res.end(datos);
  });
}).listen(puerto, () => console.log(`http://localhost:${puerto}`));
