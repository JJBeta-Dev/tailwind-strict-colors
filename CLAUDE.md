# Tailwind Strict Colors — contexto para Claude Code

Extensión de VS Code (probada en **Antigravity IDE**, un fork de VS Code) que
detecta clases de Tailwind CSS v4 que usan la **paleta default** (`bg-red-500`,
`text-gray-600`, ...) en vez de un token definido por el usuario en su propio
`@theme`, y ofrece formas de corregirlo. No depende de ESLint ni de ningún
archivo de configuración adicional: todo se deriva leyendo el CSS del usuario
en tiempo real dentro del editor.

Lee este archivo antes de tocar código aquí — explica el porqué de las
decisiones, no solo el qué (eso ya lo dice el código).

## Por qué existe

El usuario tiene un proyecto con Tailwind v4 donde el equipo (humanos + IAs
autocompletando código) tiende a usar por accidente los colores nativos de
Tailwind en vez de los tokens del design system definidos en `@theme`. No
pueden tocar las reglas de ESLint del proyecto, así que la solución vive
enteramente del lado del editor.

## Cómo está construida (arquitectura)

Separación estricta en dos capas:

1. **Lógica pura, sin `vscode`** — testeable con `node:test` directamente,
   sin necesitar el Extension Host. Vive en los módulos que NO importan
   `vscode`:
   - `tailwindPalette.ts` — paleta default de Tailwind (familias, shades,
     hex aproximados para ranking, sinónimos semánticos como
     danger/warning/success).
   - `cssThemeParser.ts` — parsea bloques `@theme { ... }` de uno o más
     archivos CSS y extrae las declaraciones `--color-*`, resolviendo
     `var()`/hex/rgb en cadena hasta 5 niveles de profundidad. Valores en
     `oklch()`/`color-mix()` se registran como token pero sin `resolvedHex`.
   - `colorScanner.ts` — motor de detección: un regex construido a partir de
     `utilities` (config) + la lista fija de familias/keywords de Tailwind.
     Un match solo es "quemado" si el nombre exacto resultante
     (`family-shade` o el keyword bare) NO está declarado en el `@theme` del
     usuario (una redefinición intencional del mismo nombre no se marca).
   - `colorDistance.ts` — rankea qué token del usuario sugerir: distancia de
     color real (redmean) si ambos lados resuelven a hex, si no, coincidencia
     por sinónimo semántico (`FAMILY_SYNONYMS` en `tailwindPalette.ts`).
   - `autoFix.ts` — combina scanner + ranking para producir la lista de
     reemplazos de un "Fix All" (toma siempre la sugerencia #1).
   - `generatedFileHeuristic.ts` — heurística para descartar bundles
     minificados (`dist/assets/index-<hash>.js`) del escaneo de workspace:
     si el promedio de caracteres por línea es muy alto, se asume generado.
     Es deliberadamente **basada en contenido, no en nombre de carpeta**
     (más robusta que mantener una lista de carpetas tipo "dist"/"build").

2. **Capa de VS Code** — todo lo que importa `vscode`, no testeado con
   `node:test` (requeriría el Extension Host):
   - `config.ts` — lee `tailwindStrictColors.*` de `workspace.getConfiguration`.
   - `themeWatcher.ts` — ubica el/los archivo(s) CSS que hacen match con
     `themeFileGlob` en cada workspace folder, los parsea, y se re-parsea
     solo con un `FileSystemWatcher` (no en cada keystroke).
   - `diagnostics.ts` — pinta el subrayado amarillo + entradas en el panel
     _Problems_, solo para documentos abiertos (debounce de 300ms en
     `extension.ts` para no re-escanear en cada tecla).
   - `codeActionProvider.ts` — Quick Fix por diagnóstico (recalcula el match
     re-corriendo el scanner sobre el texto exacto del rango del
     diagnóstico) + una acción de tipo `SourceFixAll` que delega al comando
     `fixAllInFile`.
   - `hoverProvider.ts` — al hacer hover sobre una clase quemada, muestra un
     `MarkdownString` con swatches de color (SVG en base64 inline) y links
     `command:` que ejecutan `tailwindStrictColors.applyHoverSuggestion`
     para reemplazar con un click.
   - `fixAllCommands.ts` — comandos `fixAllInFile` / `fixAllInWorkspace`.
     El de workspace pide confirmación modal porque toca múltiples archivos
     a la vez. Ambos avisan explícitamente si `theme.tokens.size === 0`
     (causa más común de "el fix no hace nada": el glob no encontró el CSS).
   - `workspaceScan.ts` — descubre archivos por extensión (mapeando
     `languages` → extensiones) y corre el scanner sobre cada uno,
     descartando generados (`generatedFileHeuristic`). Lo comparten
     `fixAllCommands.ts` y `problemsWebviewProvider.ts` para no duplicar la
     lista de extensiones/exclusiones.
   - `problemsWebviewProvider.ts` + `media/main.{css,js}` — el panel de la
     Activity Bar. Es un **Webview**, no un `TreeView` nativo: se cambió
     deliberadamente porque el `TreeView` plano se veía "viejo"; el webview
     usa las variables CSS del tema (`--vscode-*`) + codicons reales
     (copiados de `@vscode/codicons` a `media/codicons/` en vez de traerlos
     por npm en runtime) para verse pulido sin salirse del estilo del IDE.
     Comunicación por `postMessage` en ambas direcciones (ver
     "Mensajes del webview" abajo).
   - `extension.ts` — cablea todo. Un solo `ThemeWatcher` y una sola
     `DiagnosticsManager` compartidos por toda la sesión del editor.

### Flujo de datos

```
index.css (@theme)
      │  (FileSystemWatcher)
      ▼
ThemeWatcher.getTheme() ──► Map<tokenName, {rawValue, resolvedHex?}>
      │
      ├─► diagnostics.ts ──────► panel Problems + subrayado
      ├─► hoverProvider.ts ────► tooltip con sugerencias al pasar el mouse
      ├─► codeActionProvider.ts ► Quick Fix / Fix All (SourceFixAll)
      ├─► fixAllCommands.ts ───► comandos de la paleta (Ctrl+Shift+P)
      └─► problemsWebviewProvider.ts ► panel de la Activity Bar
```

Todos los consumidores llaman `scanForBurnedColors(text, options, theme)`
sobre el texto crudo del documento — no hay un parser de JSX/Vue/Svelte real,
es intencional (ver "Decisiones no obvias").

### Mensajes del webview (`media/main.js` ↔ `problemsWebviewProvider.ts`)

- `webview → extensión`: `{ type: "ready" }` (al cargar, pide el estado
  actual), `{ type: "open", uriString, startLine, startChar, endLine,
endChar }` (click en un issue → abre el archivo en esa selección).
- `extensión → webview`: `{ type: "update", payload: { files, themeTokenCount,
themeFileGlob } }`. `themeTokenCount === 0` dispara el banner de "no se
  encontró tu @theme" dentro del propio panel.

## Decisiones no obvias (el porqué)

- **Regex sobre el texto crudo, no un parser de JSX/Vue/Svelte real.** Es
  deliberado: así funciona igual en `className`, `class`, `clsx()`, `cva()`,
  template strings, etc. sin tener que soportar la sintaxis de cada
  lenguaje. El costo es que puede haber falsos positivos raros (texto que
  _parece_ una clase de Tailwind pero no lo es dentro de un string
  arbitrario); no ha sido un problema en la práctica.
- **Un match solo se ignora si el token declarado coincide EXACTAMENTE con
  el nombre por defecto** (`--color-red-500` redefinido a mano). Esto
  permite que un equipo redefina intencionalmente `red-500` sin que la
  extensión lo siga marcando, sin necesitar una lista de excepciones aparte.
- **Ranking de sugerencias con fallback semántico.** Tailwind v4 permite
  colores en `oklch()` que no convertimos a RGB (evita traer una librería de
  color solo para esto). Cuando no se puede resolver a hex, se usa
  `FAMILY_SYNONYMS` (red→danger/error, green→success, etc.) para no dejar al
  usuario sin ninguna sugerencia.
- **`generatedFileHeuristic` es por contenido, no por carpeta.** El primer
  intento fue excluir `dist/`, `build/`, etc. por glob, pero el usuario tenía
  un bundle de Vite dentro de una carpeta con nombre atípico
  (`html/assets/index-<hash>.js`). La heurística de "líneas promedio muy
  largas" generaliza sin mantener una lista infinita de nombres de carpeta.
- **Webview en vez de `TreeView`** para el panel lateral: decisión explícita
  del usuario tras ver el `TreeView` nativo ("se ve muy viejo"). Sigue
  usando variables `--vscode-*` y codicons reales para no romper el
  theming automático claro/oscuro.
- **Comandos silenciosos vs. con toast.** `refreshProblemsView` y los
  refrescos automáticos (on-save, on-theme-change) NO muestran notificación
  cuando se disparan solos (spamear un toast en cada guardado sería muy
  molesto); solo la invocación manual (paleta de comandos / botón de la
  toolbar) confirma con un mensaje. Ver `refreshProblemsView` vs
  `refreshProblemsViewSilently` en `extension.ts`.
- **`warnIfThemeIsEmpty` en `fixAllCommands.ts`.** Se agregó después de que
  el usuario reportara "los comandos no sirven para nada" — la causa real
  era que su `index.css` no calzaba con el glob configurado, así que el fix
  fallaba en silencio con un solo `showInformationMessage` fácil de perder.
  Ahora se avisa explícitamente y el mismo aviso aparece como banner en el
  webview.

## Comandos de desarrollo

```bash
npm install          # instala devDependencies (aprueba el postinstall de esbuild si npm lo pide: `npm approve-scripts esbuild`)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (flat config, eslint.config.js) — incluye eslint-plugin-tsdoc
npm test             # node:test sobre src/test/*.test.ts — solo módulos "puros" (sin vscode)
npm run build        # esbuild → dist/extension.js
npm run watch        # esbuild en modo watch (útil con F5 / Extension Development Host)
npm run format       # Prettier --write
npm run verify       # typecheck + lint + format:check + test + build, en ese orden — correr antes de cada commit
```

`npm run verify` es lo que corre `.github/workflows/ci.yml` en cada push/PR
(más el empaquetado del `.vsix` al final, solo para detectar errores de
empaquetado temprano). Todo comentario TSDoc pasa por `eslint-plugin-tsdoc`
(regla `tsdoc/syntax`) — ojo con dos gotchas reales que ya mordieron a este
proyecto: escribir `**/algo` dentro de un bloque `/** */` cierra el comentario
antes de tiempo (contiene `*/` literal), y una mención suelta de `@theme` sin
backticks se interpreta como un tag TSDoc no definido — hay que escribirla
como `` `@theme` `` (en backticks) o `\@theme` si no puede ir en backticks.

Para probar cambios en vivo: abre esta carpeta en Antigravity/VS Code y
presiona `F5` → abre una ventana con `example/` cargada (ya tiene colores
quemados de prueba en `example/src/Card.tsx` contra el `@theme` de
`example/src/index.css`).

### Empaquetar e instalar localmente (sin publicar)

```bash
npx @vscode/vsce package --allow-missing-repository --no-dependencies
```

Genera `tailwind-strict-colors-<version>.vsix`. Para instalarlo en
Antigravity sin pasar por ninguna tienda:

```bash
"<ruta a Antigravity IDE>\bin\antigravity-ide.cmd" --install-extension tailwind-strict-colors-<version>.vsix --force
```

(En esta máquina: `C:\Users\JJBeta\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd`.)
Después hay que recargar la ventana (`Ctrl+Shift+P` → _Reload Window_) para
que tome la versión nueva.

## Cómo agregar algo nuevo (convención a seguir)

1. Si la lógica se puede escribir sin importar `vscode`, ponla en un módulo
   nuevo o existente de la capa pura y agrégale tests en `src/test/`.
2. La capa de `vscode` solo debe _orquestar_ (leer config, registrar
   providers/comandos, convertir offsets ↔ `Position`/`Range`) — no debería
   tener lógica de negocio propia que valga la pena testear por separado.
3. Si agregas un setting nuevo, va en tres lugares: `package.json`
   (`contributes.configuration.properties`), `config.ts` (`ExtensionConfig`
   - `readConfig`), y donde se consuma.
4. Corre `npm run verify` antes de empaquetar o hacer commit.
5. Todo símbolo exportado lleva TSDoc con `@param`/`@returns` y, si es una
   función pura reutilizable, un `@example` — es la convención que se siguió
   en todo `src/` y `eslint-plugin-tsdoc` la valida en CI.

## Limitaciones conocidas

- Solo resuelve a color real `#hex`, `rgb()/rgba()` y cadenas de `var()`
  entre sí. `oklch()`/`hsl()`/`color-mix()` se ignoran para el cálculo de
  distancia (cae al fallback semántico).
- Detección por regex, no AST — ver "Decisiones no obvias".
- El hover provider y el `CodeActionProvider` se registran una sola vez con
  el `languages` de la config al momento de `activate()`; si cambias
  `tailwindStrictColors.languages` en caliente, ese registro no se
  actualiza (sí se actualizan diagnostics y el escaneo del workspace,
  que leen la config en cada ejecución).
- El escaneo de workspace (`workspaceScan.ts`) abre cada archivo candidato
  con `vscode.workspace.openTextDocument` — en proyectos enormes puede ser
  lento; no hay caché entre escaneos.

## Publicar en la tienda de extensiones

Ver la sección **"Publicar"** en `README.md` para el paso a paso completo.
Resumen: **Antigravity usa Open VSX Registry** (`open-vsx.org`), confirmado
en `product.json` de la instalación (`extensionsGallery.serviceUrl`), NO el
Marketplace de Microsoft. El publish real requiere una cuenta/token que solo
el usuario puede crear — no es algo que se automatice desde aquí. Antes de
publicar hay que cambiar `"publisher"` en `package.json` (hoy tiene un
placeholder) por el namespace real del usuario en Open VSX.
