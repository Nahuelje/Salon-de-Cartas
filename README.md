# Salón de cartas

Juegos de cartas hechos con HTML, CSS y JavaScript puro (sin dependencias ni compilación).
Se juega en el navegador, solo, contra bots o con amigos pasando el dispositivo.

## Juegos

| Juego | Descripción |
|---|---|
| **Chinchón** | Mazo de 40 cartas, escaleras y juegos, cortar, chinchón y eliminación a 100 puntos. Bots con 3 dificultades o modo con amigos. |
| **La casita robada** | Capturá cartas de la mesa o robale la casita al rival con el mismo número, sin importar el palo. |
| **Memoria de números** | Encontrá los pares; 8 niveles hasta 12 pares, con combos y ranking. |
| **Póker Texas Hold'em** | Ciegas crecientes, flop/turn/river, botes laterales y bots. |

Cada juego guarda su ranking (top 10) en el navegador con `localStorage`.

## Cómo ejecutarlo

Necesita servirse por HTTP (los sonidos se cargan con `fetch`), así que abrir `index.html` con doble clic no alcanza.

```bash
node serve.js        # abre http://localhost:8080
```

También se puede publicar tal cual en GitHub Pages (Settings → Pages → rama `main`, carpeta `/ (root)`).

## Estructura

```
index.html            Hub con los mosaicos de cada juego
css/arcade.css        Estilo compartido (tokens, mesa, cartas, modal)
js/comun.js           Ranking, sonidos, modal, utilidades
js/cartas.js          Baraja: rutas de imágenes, mezclar, vuelo de cartas
js/fx.js              Partículas, banners y destellos
juegos/<juego>/       index.html + lógica de cada juego
assets/cartas/        Imágenes de la baraja (52 cartas + 5 dorsos)
assets/sonidos/       Efectos de cartas y fichas
serve.js              Servidor estático mínimo para desarrollo
LICENSE               Texto completo de la licencia Apache 2.0
```

## Licencias

Este proyecto reúne material con licencias distintas. Cada parte se rige por la suya.

| Parte | Licencia | Dónde |
|---|---|---|
| **Código fuente** (HTML, CSS y JavaScript) | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | Todo el repositorio, salvo `assets/` |
| **Música y sonidos** | [CC0 1.0 (dominio público)](https://creativecommons.org/publicdomain/zero/1.0/) | `assets/sonidos/` |

### Código: Apache License 2.0

```
Copyright 2026 Nahuelje

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

El texto completo está en el archivo [`LICENSE`](LICENSE).
La licencia Apache cubre únicamente el código; **no** se extiende a las imágenes de las cartas ni a los sonidos.

### Música y sonidos: Casino Audio (CC0)

Los efectos de cartas y fichas de `assets/sonidos/` son del pack **Casino Audio (1.1)** de
[Kenney](https://kenney.nl) (Kenney Vleugels), publicado en
[OpenGameArt](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips).

- **Licencia:** [Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/).
- **Uso:** permitido en proyectos personales y comerciales, con o sin modificaciones.
- **Atribución:** no es obligatoria, pero se agradece: *Kenney (www.kenney.nl)*.
- El texto original de la licencia está en [`assets/sonidos/LICENCIA-sonidos.txt`](assets/sonidos/LICENCIA-sonidos.txt).

> Solo se incluyen los archivos `card-*`, `chip-lay-*` y `chips-stack-*` del pack original.
