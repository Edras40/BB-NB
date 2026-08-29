/* =====================================================================
   REVELACIÓN DE GÉNERO — LÓGICA PRINCIPAL
   Secciones:
   1. Utilidades y estado global
   2. Navegación por pestañas
   3. Iconos flotantes decorativos
   4. Cámara + detección facial (face-api.js)
   5. Voz del bebé (síntesis) y escucha (reconocimiento de voz)
   6. Clasificación del familiar + mensajes personalizados
   7. Flujo de pantallas (welcome -> camera -> message -> transition -> vote -> surprise)
   8. Votación y almacenamiento (localStorage)
   9. Confeti de sorpresa
   10. Estadísticas (Chart.js) + línea de tiempo
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. UTILIDADES Y ESTADO GLOBAL
   --------------------------------------------------------------------- */
const state = {
  faceDetected: false,
  awaitingAnswer: false,
  retryTimer: null,
  recognition: null,
  currentFamiliar: null,   // { category, label, message }
  selectedVote: null,      // 'nina' | 'nino'
  modelsReady: false,
  cameraStream: null,
};

function $(id) { return document.getElementById(id); }

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---------------------------------------------------------------------
   2. NAVEGACIÓN POR PESTAÑAS
   --------------------------------------------------------------------- */
const tabBtnExperience = $('tabBtnExperience');
const tabBtnStats = $('tabBtnStats');
const tabExperience = $('tabExperience');
const tabStats = $('tabStats');

function activateTab(name) {
  const isExperience = name === 'experience';
  tabBtnExperience.classList.toggle('is-active', isExperience);
  tabBtnStats.classList.toggle('is-active', !isExperience);
  tabBtnExperience.setAttribute('aria-selected', String(isExperience));
  tabBtnStats.setAttribute('aria-selected', String(!isExperience));
  tabExperience.hidden = !isExperience;
  tabStats.hidden = isExperience;
  if (!isExperience) renderStats(); // refresca estadísticas cada vez que se abre la pestaña
}

tabBtnExperience.addEventListener('click', () => activateTab('experience'));
tabBtnStats.addEventListener('click', () => activateTab('stats'));

/* ---------------------------------------------------------------------
   3. ICONOS FLOTANTES DECORATIVOS (puramente visual, no interactivo)
   --------------------------------------------------------------------- */
(function scatterFloatingIcons() {
  const icons = ['🍼', '👶', '🎀', '⭐', '🧸', '🎈'];
  const container = $('floatingIcons');
  const count = window.innerWidth < 600 ? 6 : 10;
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.textContent = randomFrom(icons);
    span.style.left = `${Math.random() * 100}%`;
    span.style.top = `${Math.random() * 100}%`;
    span.style.animationDuration = `${8 + Math.random() * 6}s`;
    span.style.animationDelay = `${Math.random() * 4}s`;
    container.appendChild(span);
  }
})();

/* ---------------------------------------------------------------------
   4. CÁMARA + DETECCIÓN FACIAL
   --------------------------------------------------------------------- */
const video = $('video');
const overlay = $('overlay');
const cameraStatus = $('cameraStatus');
const listeningPulse = $('listeningPulse');

// Modelos públicos de face-api.js (alojados por su autor para demos).
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

async function loadFaceModels() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    state.modelsReady = true;
  } catch (err) {
    console.warn('No se pudieron cargar los modelos de detección facial:', err);
    state.modelsReady = false;
  }
}

async function startCamera() {
  try {
    // audio:true además de video, para poder grabar también la voz de la
    // persona (no solo su imagen) como recuerdo descargable.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    return true;
  } catch (err) {
    console.warn('No se pudo acceder a la cámara:', err);
    cameraStatus.textContent = 'No pudimos acceder a tu cámara. Revisa los permisos e intenta de nuevo.';
    return false;
  }
}

/* ---------------------------------------------------------------------
   GRABACIÓN DE RECUERDO — graba cámara + voz de la persona (no la voz
   sintética del bebé, eso no se puede capturar) mientras interactúa, y al
   terminar de votar descarga automáticamente el clip al celular, sin
   subir nada a ningún servidor.
   --------------------------------------------------------------------- */
let mediaRecorder = null;
let recordedChunks = [];

function pickRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || null;
}

function startRecordingForCurrentPerson() {
  if (!state.cameraStream || typeof MediaRecorder === 'undefined') return;
  const mimeType = pickRecordingMimeType();
  try {
    recordedChunks = [];
    mediaRecorder = mimeType
      ? new MediaRecorder(state.cameraStream, { mimeType })
      : new MediaRecorder(state.cameraStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
  } catch (err) {
    console.warn('No se pudo iniciar la grabación de recuerdo:', err);
    mediaRecorder = null;
  }
}

function slugify(text) {
  return (text || 'invitado')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'invitado';
}

function stopRecordingAndDownload(filenameBase) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  const extension = (mediaRecorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
  mediaRecorder.onstop = () => {
    if (!recordedChunks.length) return;
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voto-${slugify(filenameBase)}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };
  try {
    mediaRecorder.stop();
  } catch (err) {
    console.warn('No se pudo finalizar la grabación de recuerdo:', err);
  }
}

let detectionLoopHandle = null;

function stopDetectionLoop() {
  if (detectionLoopHandle) {
    clearTimeout(detectionLoopHandle);
    detectionLoopHandle = null;
  }
}

// Bucle de detección: revisa cada 600ms si hay un rostro frente a la cámara.
// Sin reconocimiento facial: cada vez que detecta a alguien, pregunta
// "¿quién eres tú?" por voz.
function runDetectionLoop() {
  if (!state.modelsReady) {
    // Sin modelos disponibles (ej. sin red), asumimos presencia tras un breve retraso
    // para no bloquear la experiencia.
    detectionLoopHandle = setTimeout(() => {
      if (!state.faceDetected) onPersonDetected();
    }, 1500);
    return;
  }

  const tick = async () => {
    if (state.faceDetected || video.paused || video.ended) {
      detectionLoopHandle = setTimeout(tick, 600);
      return;
    }
    try {
      const result = await faceapi.detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
      );
      if (result) {
        onPersonDetected();
        return;
      }
    } catch (err) {
      // Silencioso: seguimos intentando
    }
    detectionLoopHandle = setTimeout(tick, 600);
  };
  tick();
}

function onPersonDetected() {
  if (state.faceDetected) return;
  state.faceDetected = true;
  cameraStatus.textContent = '¡Te veo! Escuchando tu voz…';
  greetAndListen();
}


/* ---------------------------------------------------------------------
   5. VOZ DEL BEBÉ (síntesis) Y ESCUCHA (reconocimiento de voz)
   --------------------------------------------------------------------- */
const voiceBubble = $('voiceBubble');
const voiceBubbleText = $('voiceBubbleText');
const micIndicator = $('micIndicator');
const heardText = $('heardText');

// Selección de voz para el "niño pequeño": preferimos español latino
// (México / Latinoamérica / EE.UU.) sobre español de España, ya que suele
// sonar más cercano al acento pedido.
let babyVoice = null;

function pickBabyVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const latam = voices.filter((v) => v.lang && /^es-(MX|US|419|AR|CO|CL|PE|VE|EC|GT)/i.test(v.lang));
  const anyEs = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
  return latam[0] || anyEs[0] || voices[0] || null;
}

// Habla con "voz de bebé": afinada para sonar como un niño pequeño (3-5 años),
// dulce, tierno, agudo pero natural, con ritmo tranquilo y buena claridad.
function babySpeak(text, onEnd) {
  voiceBubbleText.textContent = text;
  voiceBubble.classList.add('is-active');

  if (!('speechSynthesis' in window)) {
    if (onEnd) setTimeout(onEnd, 400);
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'es-MX';
  if (babyVoice) utter.voice = babyVoice;
  utter.pitch = 1.55;   // agudo pero natural, no chillón
  utter.rate = 0.94;    // ritmo tranquilo y claro, sin sonar lento/mayor
  utter.volume = 1;     // volumen pleno, para pronunciación clara
  utter.onend = () => { if (onEnd) onEnd(); };
  utter.onerror = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function greetAndListen() {
  babySpeak('Hola, ¿quién eres tú?', () => {
    startListeningForIdentity();
  });
}

// Voz "narrador": profunda y alegre, para la bienvenida (distinta a la voz de bebé).
let narratorVoice = null;

function pickNarratorVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Preferimos una voz en español, idealmente masculina (suele sonar más grave).
  const esVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
  const preferred =
    esVoices.find((v) => /male|hombre|jorge|diego|carlos|pablo/i.test(v.name)) ||
    esVoices[0] ||
    voices[0];
  return preferred || null;
}

function refreshVoices() {
  babyVoice = pickBabyVoice();
  narratorVoice = pickNarratorVoice();
}

if ('speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function narratorSpeak(text, onEnd) {
  if (!('speechSynthesis' in window)) {
    if (onEnd) setTimeout(onEnd, 400);
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'es-ES';
  if (narratorVoice) utter.voice = narratorVoice;
  utter.pitch = 0.55;   // grave, cálido
  utter.rate = 1.0;     // ritmo natural, con energía
  utter.volume = 1;
  utter.onend = () => { if (onEnd) onEnd(); };
  utter.onerror = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function startListeningForIdentity() {
  state.awaitingAnswer = true;
  listeningPulse.classList.add('is-on');
  micIndicator.classList.add('is-active');
  heardText.textContent = '';

  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    // Sin soporte de reconocimiento de voz en este navegador.
    cameraStatus.textContent = 'Tu navegador no soporta reconocimiento de voz. Prueba con Chrome.';
    return;
  }

  const recognition = new SpeechRecognitionClass();
  state.recognition = recognition;
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(() => {
    // 15 segundos sin respuesta: se repite la pregunta.
    try { recognition.stop(); } catch (e) {}
  }, 15000);

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    heardText.textContent = `Escuché: "${transcript}"`;
    clearTimeout(state.retryTimer);
    listeningPulse.classList.remove('is-on');
    micIndicator.classList.remove('is-active');
    handleIdentityAnswer(transcript);
  };

  recognition.onerror = () => {
    // Se maneja igual que "onend": se reintentará si corresponde.
  };

  recognition.onend = () => {
    listeningPulse.classList.remove('is-on');
    micIndicator.classList.remove('is-active');
    if (state.awaitingAnswer) {
      // No se obtuvo respuesta útil: reintentar preguntando de nuevo.
      retryQuestion();
    }
  };

  try {
    recognition.start();
  } catch (err) {
    retryQuestion();
  }
}

function retryQuestion() {
  if (!state.awaitingAnswer) return; // ya se resolvió mientras tanto
  babySpeak('¿Quién eres tú?', () => {
    if (state.awaitingAnswer) startListeningForIdentity();
  });
}

/* ---------------------------------------------------------------------
   6. CLASIFICACIÓN DEL FAMILIAR + MENSAJES PERSONALIZADOS
   --------------------------------------------------------------------- */
const MESSAGES = {
  papa: {
    label: 'papito Edras',
    kicker: 'Para ti, papá',
    options: [
      'Hola papito Edras, tengo muchas ganas de conocerte. Gracias por cuidarme desde antes de nacer. Cada día que pasa, tu voz se vuelve una de mis favoritas.',
      'Papito, pronto estaré en tus brazos. Ya quiero formar parte de nuestra familia y compartir contigo cada aventura que nos espera.',
      'Gracias por quererme tanto. Te espero muy pronto, contando los días para conocer tu sonrisa.',
    ],
  },
  mama: {
    label: 'mamita',
    kicker: 'Para ti, mamá',
    options: [
      'Gracias mamita por cuidarme todos los días. Ya quiero conocerte y sentir tus abrazos calentitos.',
      'Mamita, escucho tu voz y me siento feliz. Sé que juntos viviremos momentos hermosos.',
      'Pronto estaremos juntos y podremos abrazarnos. Gracias por llevarme contigo a todas partes.',
    ],
  },
  abuela: {
    label: 'abuelita',
    kicker: 'Para ti, abuela',
    options: [
      'Abuelita, gracias por esperarme con tanto amor. Sé que tus historias serán mis favoritas.',
      'Pronto podré recibir tus abrazos. Ya quiero sentir el cariño que solo una abuela sabe dar.',
    ],
  },
  abuelo: {
    label: 'abuelito',
    kicker: 'Para ti, abuelo',
    options: [
      'Abuelito, gracias por esperarme con tanto amor. Ya quiero escuchar tus consejos y tus risas.',
      'Pronto podré recibir tus abrazos también a ti. Sé que seremos grandes compañeros de aventuras.',
    ],
  },
  tia: {
    label: 'tía',
    kicker: 'Para ti, tía',
    options: [
      'Tía, gracias por ser parte de mi familia. Ya quiero compartir contigo muchas risas y momentos especiales.',
      'Espero jugar contigo muy pronto. Sé que me vas a consentir mucho, y yo te voy a querer todavía más.',
    ],
  },
  tio: {
    label: 'tío',
    kicker: 'Para ti, tío',
    options: [
      'Tío, gracias por acompañarme desde antes de nacer. Ya quiero que me enseñes tus mejores trucos.',
      'Pronto nos conoceremos. Estoy seguro de que seremos muy buenos amigos.',
    ],
  },
  prima: {
    label: 'prima',
    kicker: 'Para ti, prima',
    options: [
      'Prima, ya quiero jugar contigo. Sé que viviremos aventuras increíbles.',
      'Gracias por esperarme con tanto cariño. Pronto compartiremos muchas risas.',
    ],
  },
  primo: {
    label: 'primo',
    kicker: 'Para ti, primo',
    options: [
      'Primo, pronto seremos grandes amigos. Ya quiero descubrir contigo el mundo.',
      'Espero conocerte muy pronto. Sé que juntos viviremos momentos que nunca olvidaremos.',
    ],
  },
  familiar: {
    label: 'familia',
    kicker: 'Para ti',
    options: [
      'Gracias por estar aquí, ya quiero conocerte. Tu cariño se siente incluso antes de nacer.',
      'Pronto estaremos juntos en familia. Gracias por acompañarme en este camino tan especial.',
    ],
  },
};

// ---------------------------------------------------------------------
// AUDIOS REALES (grabados con ElevenLabs + Audacity) para los mensajes de
// arriba. El orden de cada lista debe coincidir con el orden de "options"
// en MESSAGES (la opción 1 de MESSAGES.papa usa el audio en la posición 0
// de aquí, la opción 2 usa la posición 1, etc.). Si falta un audio para
// una categoría, o para una opción específica, esa opción simplemente usa
// la voz del navegador como respaldo — no rompe nada.
const MESSAGE_AUDIO = {
  papa: ['assets/audio/papa-1.mp3', 'assets/audio/papa-2.mp3', 'assets/audio/papa-3.mp3'],
  mama: ['assets/audio/mama-1.mp3', 'assets/audio/mama-2.mp3', 'assets/audio/mama-3.mp3'],
  abuela: ['assets/audio/abuela-1.mp3', 'assets/audio/abuela-2.mp3'],
  abuelo: [], // sin audio grabado (no aplica en esta familia) — usa voz del navegador
  tia: ['assets/audio/tia-1.mp3', 'assets/audio/tia-2.mp3'],
  tio: ['assets/audio/tio-1.mp3', 'assets/audio/tio-2.mp3'],
  prima: ['assets/audio/prima-1.mp3', 'assets/audio/prima-2.mp3'],
  primo: ['assets/audio/primo-1.mp3', 'assets/audio/primo-2.mp3'],
  familiar: ['assets/audio/familiar-1.mp3', 'assets/audio/familiar-2.mp3'],
};

// Elige una opción al azar de MESSAGES[category] y devuelve, junto al
// texto, el audio real que le corresponde (si existe).
function pickMessage(category) {
  const entry = MESSAGES[category] || MESSAGES.familiar;
  const index = Math.floor(Math.random() * entry.options.length);
  const message = entry.options[index];
  const audioList = MESSAGE_AUDIO[category] || [];
  const audioUrl = audioList[index] || null;
  return { entry, message, audioUrl };
}

// ---------------------------------------------------------------------
// AUDIOS DEL SALUDO DINÁMICO (el que menciona el parentesco y el nombre,
// ej. "Hola, ya sé quién eres, mi tía Brenda"). Se arma pegando 2 o 3
// clips cortos: intro + relación + nombre. Si falta el audio de la
// relación, se usa la voz del navegador para todo el saludo. Si falta solo
// el audio de un nombre en particular, simplemente no se menciona el
// nombre en el audio (el texto en pantalla sí lo sigue mostrando).
// ---------------------------------------------------------------------
const AUDIO_INTRO = 'assets/audio/intro.mp3';

const AUDIO_RELATION = {
  papa: 'assets/audio/relacion-papa.mp3',
  mama: 'assets/audio/relacion-mama.mp3',
  abuela: 'assets/audio/relacion-abuela.mp3',
  tia: 'assets/audio/relacion-tia.mp3',
  tio: 'assets/audio/relacion-tio.mp3',
  prima: 'assets/audio/relacion-prima.mp3',
  primo: 'assets/audio/relacion-primo.mp3',
  // abuelo y familiar sin audio grabado — usan la voz del navegador.
};

// Nombres ya grabados como clip individual (assets/audio/nombre-<clave>.mp3).
// Agrega aquí la clave conforme vayas subiendo más (sin acentos, minúsculas).
const AVAILABLE_NAME_AUDIO = new Set([
  'edras', 'nazareth', 'maria', 'maricela', 'rosa', 'brenda', 'karina',
  'nelcy', 'glenda', 'osman', 'juan', 'eduardo', 'addy', 'amsy', 'kory',
  'alexandra', 'isaias',
]);

function nameAudioUrl(name) {
  if (!name) return null;
  const key = slugify(name);
  return AVAILABLE_NAME_AUDIO.has(key) ? `assets/audio/nombre-${key}.mp3` : null;
}

// Reproduce una lista de audios uno detrás de otro, como si fuera uno solo.
function playAudioSequence(urls, onEnd) {
  const queue = urls.filter(Boolean);
  if (!queue.length) {
    if (onEnd) onEnd();
    return;
  }
  let i = 0;
  function playNext() {
    if (i >= queue.length) {
      if (onEnd) onEnd();
      return;
    }
    const audio = new Audio(queue[i]);
    const advance = () => { i += 1; playNext(); };
    audio.onended = advance;
    audio.onerror = advance; // si un clip falla, seguimos con el siguiente
    audio.play().catch(advance);
  }
  playNext();
}

// Arma y reproduce el saludo dinámico con audios reales si existen, o con
// la voz del navegador si falta alguna pieza clave.
function speakGreeting(category, name, onEnd) {
  const relation = RELATION_LABEL[category] || '';
  const relationUrl = AUDIO_RELATION[category];

  if (relationUrl) {
    // Con audio real: el texto en pantalla coincide con lo que se escucha.
    const fixedText = `Hola, ya sé quién eres, mi ${relation}${name ? ' ' + name : ''}.`;
    voiceBubbleText.textContent = fixedText;
    voiceBubble.classList.add('is-active');

    const sequence = [AUDIO_INTRO, relationUrl];
    const nameUrl = nameAudioUrl(name);
    if (nameUrl) sequence.push(nameUrl);
    playAudioSequence(sequence, onEnd);
  } else {
    // Sin audio real para esta relación (ej. "abuelo" o desconocido):
    // usamos la voz sintética con las frases variadas de siempre.
    babySpeak(buildGreeting(relation, name), onEnd);
  }
}

// ---------------------------------------------------------------------
// Cómo se dice cada parentesco en una frase hablada (en minúsculas).
// ---------------------------------------------------------------------
const RELATION_LABEL = {
  papa: 'papá',
  mama: 'mamá',
  abuela: 'abuela',
  abuelo: 'abuelo',
  tia: 'tía',
  tio: 'tío',
  prima: 'prima',
  primo: 'primo',
  familiar: '',
};

// Nombres conocidos de antemano para parentescos con una sola persona
// (papá y mamá son siempre la misma persona). Para abuela/tía/tío/prima/
// primo, como hay varias personas distintas, no se asume ningún nombre —
// solo se usa el que la persona diga por voz.
const DEFAULT_NAMES = {
  papa: 'Edras',
  mama: 'Nazareth',
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function defaultNameForCategory(category) {
  return DEFAULT_NAMES[category] || '';
}

// Nombre a mostrar al votar para esta categoría (ej. "Papá Edras", "Tía").
function categoryDisplayName(category) {
  const relation = RELATION_LABEL[category] || '';
  const name = defaultNameForCategory(category);
  if (relation && name) return `${capitalize(relation)} ${name}`;
  if (relation) return capitalize(relation);
  return 'Invitado';
}

// Frases variadas para saludar cuando ya se sabe el parentesco (y, si se
// pudo, el nombre real). Se elige una al azar cada vez, para que no suene
// siempre igual.
const GREETING_TEMPLATES_WITH_NAME = [
  '¡Ah, mi {relation} {name}! Ya me habían contado de ti.',
  '¡{name}! Ya sé quién eres, mi {relation}.',
  'Mi {relation} {name}, qué alegría escuchar tu voz.',
  '¡Ya sé de ti, {relation} {name}!',
  '¡Hola, {relation} {name}! Ya te esperaba.',
];

const GREETING_TEMPLATES_NO_NAME = [
  '¡Hola! Ya sé que eres mi {relation}.',
  '¡Ah, mi {relation}! Qué alegría escucharte.',
  '¡Hola, {relation}! Ya me habían hablado de ti.',
];

function buildGreeting(relation, name) {
  if (!relation) return '¡Hola! Mucho gusto conocerte.';
  const templates = name ? GREETING_TEMPLATES_WITH_NAME : GREETING_TEMPLATES_NO_NAME;
  const template = randomFrom(templates);
  return template.replace('{relation}', relation).replace('{name}', name || '');
}

// Intenta sacar solo el nombre propio de frases como "Soy su tía Marcela"
// (quedaría "Marcela"). Si no encuentra nada usable, devuelve cadena vacía.
function extractRawName(rawText) {
  const cleaned = (rawText || '')
    .replace(/^\s*(soy|es)\s+/i, '')
    .replace(/^\s*(su|el|la|los|las)\s+/i, '')
    .replace(/^(pap[aá]|papi|mam[aá]|mami|abuela|abuelo|t[ií]a|t[ií]o|prima|primo)\s*/i, '')
    .trim();

  if (cleaned.length > 1 && cleaned.length < 40) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return '';
}

// Reglas de clasificación por palabras clave (orden importa: más específico primero).
function classifyIdentity(rawText) {
  const text = rawText.toLowerCase();

  if (text.includes('edras') || text.includes('papá') || text.includes('papa') || text.includes('papi')) {
    return 'papa';
  }
  if (text.includes('mamá') || text.includes('mama') || text.includes('mami')) {
    return 'mama';
  }
  if (text.includes('abuela') || text.includes('abue')) {
    return 'abuela';
  }
  if (text.includes('abuelo')) {
    return 'abuelo';
  }
  if (text.includes('tía') || text.includes('tia')) {
    return 'tia';
  }
  if (text.includes('tío') || text.includes('tio')) {
    return 'tio';
  }
  if (text.includes('prima')) {
    return 'prima';
  }
  if (text.includes('primo')) {
    return 'primo';
  }
  return 'familiar';
}

// Cuando la persona responde por voz (ej. "Soy su tía Brenda"): saca su
// nombre si lo dijo, saluda mencionándolo, y luego pasa al mensaje.
function handleIdentityAnswer(rawText) {
  state.awaitingAnswer = false;
  const category = classifyIdentity(rawText);
  const { entry, message, audioUrl } = pickMessage(category);
  const relation = RELATION_LABEL[category] || '';
  const rawName = extractRawName(rawText);
  const name = rawName || defaultNameForCategory(category);
  const voterName = relation && name ? `${capitalize(relation)} ${name}` : categoryDisplayName(category);

  state.currentFamiliar = { category, label: entry.label, kicker: entry.kicker, message, audioUrl, voterName };

  speakGreeting(category, name, () => {
    showMessageScreen();
  });
}

/* ---------------------------------------------------------------------
   7. FLUJO DE PANTALLAS
   --------------------------------------------------------------------- */
const screens = {
  camera: $('screenCamera'),
  message: $('screenMessage'),
  transition: $('screenTransition'),
  vote: $('screenVote'),
  surprise: $('screenSurprise'),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove('is-active'));
  screens[name].classList.add('is-active');
}

// --- Iniciar cámara y detección ---
// La cámara ya se ve desde el primer momento (es la pantalla activa por
// defecto en el HTML). Pero el permiso de cámara/micrófono en el celular
// solo lo conceden los navegadores si hay un toque real de la persona justo
// antes — no es algo que se pueda evitar desde el código. Por eso esperamos
// el primer toque/clic en cualquier parte de la pantalla (no un botón
// concreto, cualquier toque cuenta) para pedir el permiso ahí mismo.
let cameraStarted = false;

function startCameraFlow() {
  if (cameraStarted) return;
  cameraStarted = true;

  (async () => {
    // Cargamos los modelos (incluye reconocimiento facial, si hay fotos) en
    // paralelo con el permiso/inicio de cámara, para no sumar esperas.
    const [, ok] = await Promise.all([loadFaceModels(), startCamera()]);
    if (ok) {
      runDetectionLoop();
      startRecordingForCurrentPerson(); // empieza a grabar el recuerdo de esta persona
    }
  })();
}

document.addEventListener('click', startCameraFlow, { once: true });
document.addEventListener('keydown', startCameraFlow, { once: true });
document.addEventListener('touchstart', startCameraFlow, { once: true });

// --- Pantalla 2: mensaje personalizado ---
function showMessageScreen() {
  showScreen('message');
  $('messageKicker').textContent = state.currentFamiliar.kicker;
  $('messageText').textContent = state.currentFamiliar.message;

  // Si hay un audio real grabado para este mensaje, lo reproducimos tal
  // cual. Si no hay, o falla la reproducción, usamos la voz del navegador.
  const audioUrl = state.currentFamiliar.audioUrl;
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch((err) => {
      console.warn('No se pudo reproducir el audio grabado, usando voz del navegador:', err);
      babySpeak(state.currentFamiliar.message);
    });
  } else {
    babySpeak(state.currentFamiliar.message);
  }
}

$('btnToVote').addEventListener('click', () => {
  window.speechSynthesis && window.speechSynthesis.cancel();
  showScreen('transition');
  setTimeout(() => {
    // Mostramos el nombre ya capturado al identificarse, sin volver a pedirlo.
    const name = (state.currentFamiliar && state.currentFamiliar.voterName) || 'Invitado';
    $('voteVoterName').innerHTML = `Votando como <strong>${escapeHtml(name)}</strong>`;
    showScreen('vote');
  }, 1800);
});

// --- Pantalla 4: votación ---
const voteOptions = document.querySelectorAll('.vote-option');
voteOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    voteOptions.forEach((b) => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    state.selectedVote = btn.dataset.vote;
  });
});

$('btnSubmitVote').addEventListener('click', async () => {
  const name = (state.currentFamiliar && state.currentFamiliar.voterName) || 'Invitado';
  const errorEl = $('voteError');
  if (!state.selectedVote) {
    errorEl.textContent = 'Elige si crees que será niño o niña.';
    return;
  }
  errorEl.textContent = '';
  const submitBtn = $('btnSubmitVote');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';
  const ok = await saveVote(name, state.selectedVote, state.currentFamiliar ? state.currentFamiliar.category : null);
  submitBtn.disabled = false;
  submitBtn.textContent = 'Enviar voto';
  if (!ok) {
    errorEl.textContent = 'No se pudo guardar el voto. Revisa tu conexión e inténtalo de nuevo.';
    return;
  }
  showSurpriseScreen();
});

// --- Pantalla 5: sorpresa final ---
// Se muestra 5 segundos y vuelve sola a la cámara para el siguiente
// invitado, en bucle, sin necesitar ningún botón.
function showSurpriseScreen() {
  showScreen('surprise');
  launchConfetti();
  const name = (state.currentFamiliar && state.currentFamiliar.voterName) || 'Invitado';
  stopRecordingAndDownload(name); // descarga el video de recuerdo de esta persona
  setTimeout(restartForNextPerson, 5000);
}

function restartForNextPerson() {
  // Reinicia el flujo para que otra persona participe, sin recargar la cámara.
  state.faceDetected = false;
  state.selectedVote = null;
  state.currentFamiliar = null;
  voteOptions.forEach((b) => b.classList.remove('is-selected'));
  cameraStatus.textContent = 'Buscando a alguien frente a la cámara…';
  showScreen('camera');
  startRecordingForCurrentPerson(); // empieza la grabación del siguiente invitado
  runDetectionLoop();
}

/* ---------------------------------------------------------------------
   8. VOTACIÓN Y ALMACENAMIENTO (Supabase — compartido entre celular y TV)
   --------------------------------------------------------------------- */

// Trae todos los votos desde Supabase, ordenados del más antiguo al más nuevo.
async function getVotes() {
  const { data, error } = await sb
    .from('votes')
    .select('name, vote, familiar, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('No se pudieron cargar los votos desde Supabase:', error);
    return [];
  }
  // Adaptamos "created_at" (columna de Supabase) a "timestamp" (nombre usado internamente).
  return data.map((v) => ({
    name: v.name,
    vote: v.vote,
    familiar: v.familiar,
    timestamp: v.created_at,
  }));
}

// Guarda un voto nuevo en Supabase. Devuelve true/false según si tuvo éxito.
async function saveVote(name, vote, familiarCategory) {
  const { error } = await sb.from('votes').insert({
    name,
    vote,          // 'nina' | 'nino'
    familiar: familiarCategory,
  });
  if (error) {
    console.warn('No se pudo guardar el voto en Supabase:', error);
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------------
   9. CONFETI DE SORPRESA
   --------------------------------------------------------------------- */
function launchConfetti() {
  const container = $('surpriseConfetti');
  container.innerHTML = '';
  const colors = ['#F2A6CE', '#9CD4F2', '#F3CE7A', '#FFFFFF'];
  const pieces = 40;
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = randomFrom(colors);
    piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 3200);
}

/* ---------------------------------------------------------------------
   10. ESTADÍSTICAS (Chart.js) + LÍNEA DE TIEMPO
   --------------------------------------------------------------------- */
let pieChartInstance = null;
let barChartInstance = null;

async function renderStats() {
  const votes = await getVotes();
  const total = votes.length;
  const ninaCount = votes.filter((v) => v.vote === 'nina').length;
  const ninoCount = votes.filter((v) => v.vote === 'nino').length;
  const ninaPct = total ? Math.round((ninaCount / total) * 100) : 0;
  const ninoPct = total ? Math.round((ninoCount / total) * 100) : 0;

  $('statTotal').textContent = total;
  $('statNinaCount').textContent = ninaCount;
  $('statNinoCount').textContent = ninoCount;
  $('statNinaPercent').textContent = `${ninaPct}%`;
  $('statNinoPercent').textContent = `${ninoPct}%`;

  renderPieChart(ninaCount, ninoCount);
  renderBarChart(ninaCount, ninoCount);
  renderTimeline(votes);
}

function renderPieChart(ninaCount, ninoCount) {
  const ctx = $('pieChart').getContext('2d');
  const data = {
    labels: ['Niña', 'Niño'],
    datasets: [{
      data: [ninaCount, ninoCount],
      backgroundColor: ['#F2A6CE', '#9CD4F2'],
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  };
  if (pieChartInstance) {
    pieChartInstance.data = data;
    pieChartInstance.update();
  } else {
    pieChartInstance = new Chart(ctx, {
      type: 'pie',
      data,
      options: {
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Quicksand' } } } },
      },
    });
  }
}

function renderBarChart(ninaCount, ninoCount) {
  const ctx = $('barChart').getContext('2d');
  const data = {
    labels: ['Niña', 'Niño'],
    datasets: [{
      label: 'Votos',
      data: [ninaCount, ninoCount],
      backgroundColor: ['#F2A6CE', '#9CD4F2'],
      borderRadius: 10,
    }],
  };
  if (barChartInstance) {
    barChartInstance.data = data;
    barChartInstance.update();
  } else {
    barChartInstance = new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}

function renderTimeline(votes) {
  const list = $('timelineList');
  list.innerHTML = '';
  if (!votes.length) {
    list.innerHTML = '<li class="timeline-empty">Aún no hay votos registrados.</li>';
    return;
  }
  // Orden cronológico: más reciente primero.
  const sorted = [...votes].reverse();
  sorted.forEach((v) => {
    const li = document.createElement('li');
    const time = new Date(v.timestamp).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    li.innerHTML = `
      <span>${escapeHtml(v.name)} <span style="opacity:.6">· ${time}</span></span>
      <span class="timeline-badge ${v.vote}">${v.vote === 'nina' ? 'Niña' : 'Niño'}</span>
    `;
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

$('btnResetVotes').addEventListener('click', () => {
  // Por seguridad, la clave pública (anon) NO tiene permiso de borrar votos
  // (solo insertar y leer) — así ningún invitado puede borrar la votación
  // por accidente o a propósito desde el celular o la TV.
  alert('Por seguridad, los votos no se pueden borrar desde aquí. Entra al panel de Supabase → Table Editor → "votes" para eliminarlos manualmente.');
});

// Estadísticas iniciales (por si el usuario entra directo a esa pestaña).
renderStats();
