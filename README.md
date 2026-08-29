# ¿Niño o Niña? — App de Revelación de Género

Experiencia web interactiva: cada invitado es recibido por la "voz" del bebé,
se identifica por voz (o texto), recibe un mensaje personalizado y vota si
cree que será niño o niña. Incluye una pestaña de estadísticas en vivo.

## 1. Estructura de carpetas

```
gender-reveal/
├── index.html            # Experiencia interactiva (pensada para el celular de cada invitado)
├── styles.css            # Diseño visual compartido: paleta pastel, glassmorphism, animaciones
├── script.js             # Lógica de la experiencia: cámara, voz, clasificación, envío de votos
├── tv.html               # Pantalla de estadísticas a pantalla completa (pensada para la TV/plasma)
├── tv.css                # Estilos a escala grande para verse bien desde lejos
├── tv.js                 # Lógica de la TV: carga votos y se suscribe en tiempo real a Supabase
├── supabase-config.js    # Conexión compartida a la base de datos (URL + clave pública)
├── assets/
│   └── audio/            # Mensajes y saludos grabados con voz real (ver sección 2.2)
└── README.md             # Este archivo
```

No se necesita build ni backend propio: es HTML/CSS/JS puro + Supabase como
base de datos en la nube. Los votos que se guardan desde `index.html` (el
celular) aparecen automáticamente en `tv.html` (la TV) sin recargar nada,
gracias a Supabase Realtime.

## 2. Dependencias externas (cargadas por CDN, ya incluidas en los HTML)

| Librería | Uso | Origen |
|---|---|---|
| `face-api.js` v0.22.2 | Detección de presencia frente a la cámara | jsDelivr CDN |
| Modelos `tiny_face_detector` | Pesos del modelo de detección | `justadudewhohacks.github.io/face-api.js/models` |
| `Chart.js` v4.4.4 | Gráfico de pastel y de barras (celular y TV) | jsDelivr CDN |
| `@supabase/supabase-js` v2 | Guardar votos y recibirlos en tiempo real | jsDelivr CDN |
| Google Fonts: `Baloo 2` + `Quicksand` | Tipografía display y de cuerpo | fonts.googleapis.com |
| Web Speech API | `SpeechSynthesisUtterance` (respaldo) y `SpeechRecognition` (escuchar respuestas) | Nativa del navegador, sin instalación |

## 2.1 Configuración de Supabase (obligatoria)

Los votos viven en una tabla `votes` de un proyecto de Supabase. Para
crearla, entra al **SQL Editor** de tu proyecto y ejecuta:

```sql
create table votes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vote text not null check (vote in ('nina','nino')),
  familiar text,
  created_at timestamptz not null default now()
);

alter table votes enable row level security;

create policy "Public puede votar"
on votes for insert
to anon
with check (true);

create policy "Public puede leer votos"
on votes for select
to anon
using (true);
```

Luego, en **Database → Replication**, activa el interruptor de "Realtime"
para la tabla `votes` (así la TV recibe los votos al instante).

Por diseño, la clave pública (`anon`) **no** tiene permiso de actualizar ni
borrar filas — solo insertar y leer. Así ningún invitado puede alterar o
borrar la votación desde el celular o la TV. Si necesitas reiniciar los
votos entre fiestas, hazlo desde **Table Editor** en el panel de Supabase.

`supabase-config.js` ya contiene la URL y la clave pública de tu proyecto;
si alguna vez cambias de proyecto, solo edita esas dos constantes.

## 2.2 Voz del bebé con audios reales (grabados con ElevenLabs + Audacity)

Los mensajes personalizados y el saludo dinámico usan audios reales
guardados en `assets/audio/`, en vez de la voz sintética del navegador:

- **Mensajes fijos**: `papa-1.mp3` a `papa-3.mp3`, `mama-1.mp3` a
  `mama-3.mp3`, `abuela-1/2.mp3`, `tia-1/2.mp3`, `tio-1/2.mp3`,
  `prima-1/2.mp3`, `primo-1/2.mp3`, `familiar-1/2.mp3`.
- **Saludo dinámico** (el que dice el nombre de quien llega): se arma
  pegando `intro.mp3` + `relacion-<parentesco>.mp3` + `nombre-<nombre>.mp3`.

Si falta algún archivo (por ejemplo, para "abuelo", o un nombre que aún no
se grabó), la app cae automáticamente a la voz sintética del navegador
para esa parte — nunca se queda muda. Los nombres y las listas de qué
audio corresponde a qué mensaje están en `script.js`, en las constantes
`MESSAGE_AUDIO`, `AUDIO_RELATION` y `AVAILABLE_NAME_AUDIO` — edítalas ahí
si agregas o cambias personas.

## 3. Cómo funciona el flujo (Tab 1)

1. **Bienvenida** → el usuario toca "Comenzar experiencia" (esto dispara el
   permiso de cámara/micrófono, requerido por los navegadores).
2. **Cámara** → `face-api.js` revisa cada ~600ms si hay un rostro. Al
   detectarlo, el bebé pregunta "Hola, ¿quién eres tú?" con voz aguda
   (`pitch: 1.8`). Si no hay respuesta en 20s, repite la pregunta.
3. Se clasifica la respuesta por palabras clave (papá/Edras, mamá, abuela,
   abuelo, tía, tío, prima, primo) y se elige un mensaje al azar de ese grupo.
4. **Mensaje personalizado** → se muestra y se narra con la voz del bebé.
5. **Transición** → animación "¡Es tiempo de votar!" (1.8s).
6. **Votación** → Niño / Niña + nombre → se guarda en Supabase (visible al
   instante en la pantalla de la TV).
7. **Sorpresa** → confeti de celebración y opción de ver estadísticas o dejar
   que otra persona participe (sin recargar la cámara).

Si el navegador no soporta reconocimiento de voz, o no hay permiso de
micrófono/cámara, aparece un campo de texto ("Prefiero escribirlo") para
identificarse manualmente — así nadie queda bloqueado.

## 4. Pestaña 2 en el celular / `tv.html` en la TV

`index.html` incluye una pestaña "Estadísticas" para que cualquiera pueda
verlas también desde su celular. `tv.html` es una página aparte, pensada
para dejarse abierta a pantalla completa en un televisor o proyector durante
toda la fiesta: números grandes, gráfico de pastel, gráfico de barras y la
lista de los últimos en votar, todo actualizándose solo en tiempo real vía
Supabase (sin refrescar la página).

Para usarla en la TV: abre `tv.html` en el navegador del televisor (o de una
laptop/Chromecast conectada a él) y ponlo en pantalla completa (F11 en la
mayoría de navegadores de escritorio).

## 5. Desplegar

### GitHub Pages
1. Sube estos archivos a **github.com/Edras40/NOC-TEKCOM-SV**.
2. Ve a *Settings → Pages* → selecciona la rama `main` y la carpeta raíz `/`.
3. Tu app quedará en `https://edras40.github.io/NOC-TEKCOM-SV/` (la
   experiencia) y `https://edras40.github.io/NOC-TEKCOM-SV/tv.html` (la TV).
4. Importante: GitHub Pages sirve por HTTPS, lo cual es **obligatorio** para
   que `getUserMedia` (cámara/micrófono) funcione en producción.

### Firebase Hosting (alternativa a GitHub Pages)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # elige esta carpeta como "public directory"
firebase deploy
```
Firebase Hosting también sirve por HTTPS por defecto. (Esto es solo para
alojar los archivos; la base de datos de votos sigue siendo Supabase.)

## 6. Notas de accesibilidad y compatibilidad

- Botones grandes, alto contraste de texto sobre las tarjetas de cristal.
- Indicador visual (punto parpadeante + halo alrededor del video) cuando el
  micrófono está escuchando.
- `prefers-reduced-motion` respetado: las animaciones se desactivan si el
  sistema operativo lo indica.
- Probado conceptualmente para Chrome y Edge de escritorio y Android (donde
  `webkitSpeechRecognition` está disponible). Safari/iOS no soporta
  `SpeechRecognition`; en ese caso la app recurre automáticamente al campo
  de texto.
