# Antigravity Plugin for Claude Code (`agy-cc`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Multi-Agent](https://img.shields.io/badge/Architecture-Dual--Agent%20Pairing-blue.svg)](#arquitectura)

Orquestación multi-agente para conectar **Claude Code** con **Google Antigravity CLI (`agy`)** y **Codex** como sub-agentes ejecutores. Diseñado para trabajar en un conjunto armonioso donde Claude Code actúa como orquestador de alto nivel y Antigravity/Gemini o Codex ejecutan revisiones cruzadas independientes, scaffolding masivo y contrastes de arquitectura sin saturar la ventana de contexto.

---

## 1. Visión y Arquitectura

* **Host / Orquestador (Claude Code):** Mantiene el razonamiento de alto nivel, la toma de decisiones arquitectónicas y la dirección general de la sesión interactiva.
* **Worker / Sub-agente (Antigravity CLI / Gemini / Codex):** Ejecuta tareas pesadas con acceso directo a archivos locales, inspección de diffs, scaffolding y auditorías de seguridad.
* **Context Shielding:** Claude delega la tarea pesada al sub-agente en sub-procesos aislados; el sub-agente procesa el sistema de archivos y devuelve un *digest* conciso, protegiendo la ventana de contexto de Claude de saturarse con miles de líneas repetitivas.

```
+-------------------------------------------------------------+
|                        CLAUDE CODE                          |
|  - Dirección de proyecto                                    |
|  - Sesión interactiva                                       |
+-------------------------------------------------------------+
                               |
        /antigravity:review    |    /antigravity:delegate
                               v
+-------------------------------------------------------------+
|                     ANTIGRAVITY-CC                          |
|  Wrapper en Node.js (bin/agy-wrapper.mjs)                  |
+-------------------------------------------------------------+
                               |
                      spawn('agy -p ...') / stdin
                               v
+-------------------------------------------------------------+
|             ANTIGRAVITY CLI / GEMINI / CODEX                |
|  - Inspección de Git Diff                                   |
|  - Creación de Tests / Mocks / Scaffolding                  |
|  - Generación de informe condensado                         |
+-------------------------------------------------------------+
```

---

## 2. Requisitos Previos

1. **Node.js >= 18.0.0** instalado.
2. **Claude Code** instalado globalmente (`claude`).
3. **Google Antigravity CLI** (`agy`) o **Gemini CLI** (`npm install -g @google/gemini-cli`) accesible en tu `$PATH`.
   *(Opcionalmente Codex CLI si utilizas el motor alternativo `codex`).*
4. **Git** configurado en el repositorio de trabajo.

---

## 3. Instalación

### Opción A: Registrar como Plugin en Claude Code

1. Ubica o clona este proyecto en tu máquina:
   ```bash
   cd ~/proyectos/antigravity-cc
   npm install
   ```

2. Registra el marketplace local en Claude Code:
   ```text
   /plugin marketplace add /ruta/absoluta/a/antigravity-cc
   ```
   *(En Windows: `/plugin marketplace add C:\Users\tu-usuario\Documents\proyectos\antigravity-cc`)*

3. Instala el plugin:
   ```text
   /plugin install antigravity@local
   /reload-plugins
   ```

### Opción B: Uso directo como CLI / Wrapper

Puedes invocar el wrapper directamente desde cualquier terminal:
```bash
node bin/agy-wrapper.mjs status
node bin/agy-wrapper.mjs test
```

---

## 4. Comandos Disponibles

Una vez instalado en Claude Code, dispones de los siguientes comandos slash:

| Comando | Descripción |
| :--- | :--- |
| `/antigravity:review` | Ejecuta una revisión cruzada e independiente del `git diff` local con Gemini/Antigravity antes de realizar commit o merge. |
| `/antigravity:delegate <tarea>` | Delega una tarea intensiva de scaffolding, generación de pruebas unitarias o refactor y devuelve un digest a Claude. |
| `/antigravity:challenge <hipótesis>` | Realiza un contraste técnico adversarial buscando fallos de escalabilidad, cuellos de botella y edge cases. |
| `/antigravity:status` | Muestra el estado del motor detectado (`agy`, `gemini` o `codex`) y la plataforma. |
| `/antigravity:test` | Ejecuta un ping de conectividad con el CLI del sub-agente. |

### Ejemplos Prácticos

#### 1. Revisión Dual de Código
```text
/antigravity:review
```
El sub-agente analiza el git diff y reporta:
- Riesgos de inyección / vulnerabilidades OWASP.
- Bugs de concurrencia y null pointers.
- Cuellos de botella de rendimiento.
- Veredicto final: `APROBADO` o `REQUIERE ATENCIÓN`.

#### 2. Scaffolding y Generación de Tests sin Saturar Contexto
```text
/antigravity:delegate Escribir suite de pruebas unitarias con Vitest para src/services/auth.ts
```

#### 3. Auditoría Adversarial de Arquitectura
```text
/antigravity:challenge ¿Es viable usar SQLite con WAL mode para soportar 100 workers concurrentes en Node.js?
```

---

## 5. Configuración de Motores (Antigravity / Gemini / Codex)

Por defecto, el wrapper detecta automáticamente el binario disponible en el siguiente orden de prioridad:

1. Variable de entorno `AGY_BIN` (si está definida).
2. Binario global `agy` en el PATH.
3. Binario global `gemini` en el PATH (con `--skip-trust` automático).
4. Binario global `codex` en el PATH (si el motor Codex está activo).

### Variables de Entorno Opcionales (`.env`):

```bash
# Ruta personalizada al binario ejecutable
AGY_BIN=/usr/local/bin/agy

# Selección explícita del motor ('antigravity' o 'codex')
AGY_ENGINE=antigravity

# Ruta al binario de Codex si se usa dicho motor
CODEX_BIN=codex
```

---

## 6. Pruebas y Auditoría de Seguridad

Este repositorio incluye una suite automatizada de pruebas sin dependencias externas:

### Ejecutar Pruebas Funcionales y de Seguridad
```bash
npm test
```

### Auditoría Específica de Credenciales
```bash
npm run check-security
```

La auditoría verifica que:
- **Cero Credenciales Expuestas:** Escaneo recursivo contra patrones de API keys (Google, OpenAI, Anthropic, GitHub, AWS, JWTs, llaves privadas).
- **`.gitignore` Hermético:** Excluye `.env`, `.env.*`, credenciales OAuth, llaves `.pem`/`.key`, `.claude.json`, logs y directorios de sesión.
- **`.env.example` Seguro:** Contiene únicamente placeholders explicativos.
- **No Rutas Absolutas Personales:** No se filtran rutas privadas ni nombres de usuario del sistema local.

---

## 7. Estructura del Repositorio

```text
antigravity-cc/
├── .claude-plugin/
│   └── plugin.json             # Manifiesto del plugin para Claude Code
├── .codex-plugin/
│   └── plugin.json             # Manifiesto para interoperabilidad con Codex
├── bin/
│   └── agy-wrapper.mjs         # Orquestador y puente CLI principal
├── skills/
│   ├── antigravity-review/     # Skill: Revisión cruzada de código
│   ├── antigravity-delegate/   # Skill: Delegación de tareas y scaffolding
│   └── antigravity-challenge/  # Skill: Crítica y contraste arquitectónico
├── tests/
│   ├── wrapper.test.mjs        # Pruebas funcionales de comandos y CLI
│   └── security-audit.test.mjs # Auditoría automatizada de credenciales y privacidad
├── .env.example                # Plantilla de variables de entorno (sin secretos)
├── .gitignore                  # Reglas estrictas para evitar fugas de información
├── LICENSE                     # Licencia MIT
├── package.json                # Configuración de paquete y scripts de test
└── README.md                   # Documentación completa y guía de uso
```

---

## 8. Licencia

Distribuido bajo la licencia [MIT](LICENSE). Código abierto, seguro y listo para su publicación.
