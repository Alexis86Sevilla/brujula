# Plan: `src/ingest` (loader, chunker, walk, chunk-id)

## Contexto
`docs/specs/ingest.md` define cómo convertir el wiki (markdown) en chunks citables (fichero + headingPath + rango de líneas). Hoy `src/` solo tiene `version.ts` y `mcp/`; no existe `src/ingest` ni `test/ingest`. Stack: TS ESM `NodeNext`, `strict` + `noUncheckedIndexedAccess`, vitest, zod. Única dependencia nueva: `gray-matter`. TDD estricto: cada test se ve fallar (RED) antes de implementar (GREEN).

## Paso 1 (lo ÚNICO que se ejecuta tras aprobar)
1. `npm i gray-matter`
2. Crear `src/ingest/types.ts` (la spec no define campos; propuesta inferida, ver ambigüedad A1):
   ```ts
   export interface MarkdownDoc {
     path: string;                          // as passed to loadMarkdown
     title: string;
     frontmatter: Record<string, unknown>;
     body: string;                          // LF-normalized, without frontmatter
     bodyStartLine: number;                 // 1-based file line where body starts
   }
   export interface Chunk {
     docPath: string;
     title: string;                         // doc title, for citations
     headingPath: string[];
     startLine: number;                     // 1-based, inclusive, file-relative
     endLine: number;                       // 1-based, inclusive
     text: string;                          // exactly lines startLine..endLine joined by "\n"
   }
   ```
3. `npx tsc --noEmit` y pegar salida. Nada más.

## Pasos siguientes (NO se ejecutan ahora)
Orden por dependencias: chunk-id → walk → loader → chunker. Por módulo: `src/ingest/<m>.ts`, `test/ingest/<m>.test.ts` (sufijo `.test.ts`), fixtures en `test/ingest/fixtures/`. Imports `../../src/ingest/<m>.js`.

### 2. chunk-id — `src/ingest/chunk-id.ts` (`node:crypto`)
| # | Test (RED) | Caso spec |
|---|---|---|
| 1 | devuelve 16 hex `/^[0-9a-f]{16}$/` | "first 16 hex chars of SHA-256" |
| 2 | mismo chunk con otro `startLine`/`endLine` → mismo id | "line numbers must NOT affect it" |
| 3 | cambiar `docPath`, `headingPath` o `text` → id distinto (3 asserts) | campos del hash |
| 4 | `["a b"]` vs `["a","b"]` y `docPath`/`text` desplazados → ids distintos | serialización sin colisiones (A2) |
GREEN: `sha256(JSON.stringify([docPath, headingPath, text])).slice(0,16)`.

### 3. walk — `src/ingest/walk.ts` (`findMarkdownFiles`, `fs.readdir` recursivo)
| # | Test | Caso spec |
|---|---|---|
| 1 | árbol temporal (`mkdtemp` en `os.tmpdir()`) → solo `*.md`, relativas | "root-relative `*.md`" |
| 2 | `A.MD`, `b.Md` incluidos; `x.mdx`, `md.txt` no | "extension case-insensitive" |
| 3 | rutas anidadas con `/` | "POSIX-separated" |
| 4 | salida ordenada, determinista | "Sorted" |
| 5 | `.git`, `.attachments`, `node_modules` ignorados (también anidados) | defaults |
| 6 | `ignoreDirs: ["drafts"]` ignora `drafts` | opción (A9) |

### 4. loader — `src/ingest/loader.ts` (`loadMarkdown`, gray-matter + zod para frontmatter)
| # | Test | Caso spec |
|---|---|---|
| 1 | fichero con CRLF → `body` sin `\r` | "normalizes CRLF" |
| 2 | con frontmatter → `body` sin bloque, `frontmatter` parseado | "body without frontmatter" |
| 3 | `bodyStartLine` = 1 sin frontmatter; = línea tras `---` de cierre con él | `bodyStartLine` |
| 4 | `title` de frontmatter gana | precedencia 1 |
| 5 | `title: ""` / `title: 3` → cae a `# ` | "non-empty string" |
| 6 | `# ` dentro de ``` o ~~~ ignorado; usa el de fuera | "outside code fences" |
| 7 | sin título ni `# ` → nombre sin extensión; `## X` no cuenta | precedencia 3 |
| 8 | YAML inválido → rechaza con `Invalid frontmatter in <path>: ` | mensaje |
| 9 | cargar el mismo inválido 2 veces → rechaza ambas | "every time" (caché de gray-matter, A8) |

### 5. chunker — `src/ingest/chunker.ts` (`chunkMarkdown`)
Helpers internos (no exportados salvo que un test lo pida): detector de fences, divisor de secciones, divisor de bloques, empaquetador, overlap.
| # | Test | Caso spec |
|---|---|---|
| 1 | doc sin headings → 1 chunk, `headingPath []` | texto antes del 1.er heading |
| 2 | `# A` / `## B` / `## C` / `# D` → paths `[A]`,`[A,B]`,`[A,C]`,`[D]` | pila; pop de igual o más profundo |
| 3 | `#` a `######` crean sección; `#######` y `#tag` no | ATX 1–6 |
| 4 | `# X` dentro de ``` y ~~~ no crea sección | "outside fenced code blocks" |
| 5 | heading seguido solo de blanco/otro heading → sin chunk | sección vacía |
| 6 | sección corta → 1 chunk que empieza en la línea del heading | heading con 1.er bloque |
| 7 | varios párrafos > maxChars → empaquetado greedy, cada chunk ≤ maxChars de contenido nuevo | packing |
| 8 | fence > maxChars → un único chunk intacto | "never split" |
| 9 | overlapLines=2 → chunk 2 repite 2 últimas líneas NO en blanco del 1; blancas intermedias en `text` | overlap |
| 10 | longitud del chunk con overlap puede superar maxChars | "Overlap is extra" |
| 11 | overlapLines=0 → empieza en su primer bloque | overlap 0 |
| 12 | 1.er chunk de nueva sección sin overlap de la anterior | "never crosses section" |
| 13 | ningún chunk empieza/termina en línea en blanco | sin blancas en bordes |
| 14 | con frontmatter: `startLine/endLine` relativos al fichero; `text === lines.slice(start-1,end).join("\n")` para todo chunk (invariante) | líneas 1-based del fichero |
| 15 | defaults `maxChars=800`, `overlapLines=2` sin opciones | firma |

### 6. Cierre de cada módulo
`npm run check` en verde; un commit Conventional por módulo (`feat(ingest): ...`, tests incluidos).

## Ambigüedades de la spec (a decidir antes del paso 2)
- **A1** Tipos: la spec remite a `types.ts` sin definir campos. Propuesta arriba (¿`title` en `Chunk`? ¿`frontmatter` tipado?).
- **A2** chunkId: no fija serialización ni separador; concatenar sin delimitar colisiona. Propuesta: `JSON.stringify([docPath, headingPath, text])`.
- **A3** maxChars: ¿cuenta `text.length` con los `\n` y las líneas en blanco entre bloques? ¿La línea del heading cuenta? Propuesta: longitud del texto nuevo unido por `\n`, heading incluido.
- **A4** Heading + primer bloque > maxChars (bloque no-fence): ¿se parte el párrafo? La spec solo prohíbe partir fences. Propuesta: un bloque nunca se parte; si excede, chunk sobredimensionado.
- **A5** Overlap si el chunk previo tiene menos de `overlapLines` líneas no en blanco, o si el overlap incluye la línea del heading: ¿se repite el heading? Propuesta: se toman las que haya, heading incluido.
- **A6** Sintaxis ATX: ¿exige espacio tras `#`? ¿hasta 3 espacios de sangría? ¿cierre `# T #`? ¿heading vacío `#`? Propuesta CommonMark: espacio obligatorio, ≤3 espacios, quitar `#` de cierre.
- **A7** Fences: ¿cierre con mismo carácter y longitud ≥ apertura? ¿fence sin cerrar llega a EOF? Propuesta CommonMark: sí y sí.
- **A8** "Rechaza siempre": gray-matter cachea por contenido cuando no se pasan opciones (el 2.º parse no lanza). Hay que pasar opciones o evitar la caché; el test 9 lo fija.
- **A9** `ignoreDirs`: ¿sustituye o se suma a los defaults? ¿comparación case-sensitive? ¿se siguen symlinks? Propuesta: sustituye (default = los 3), case-sensitive, no seguir symlinks.
- **A10** "Sorted": ¿orden por code unit o `localeCompare`? Propuesta: code unit (determinista entre máquinas).
- **A11** `title` de frontmatter con solo espacios: ¿"non-empty"? Propuesta: `trim()` antes de comprobar.
- **A12** `bodyStartLine` con frontmatter vacío (`---\n---`) o fichero solo con frontmatter. Propuesta: línea siguiente al cierre.

## Verificación (paso 1)
`npx tsc --noEmit` sin errores y `package.json` con `gray-matter` en `dependencies`. Se pega la salida.
