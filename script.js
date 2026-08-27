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

// --- Reconocimiento facial opcional ---
// Si en /assets/faces/<categoria>/fotoN.jpg hay fotos de referencia, la app
// intenta reconocer a la persona por su rostro y salta directo al mensaje
// personalizado, sin preguntar por voz. Si no hay fotos, o el rostro no
// coincide con ninguna, se sigue preguntando "¿quién eres tú?" como siempre.
const FACE_CATEGORIES = ['papa', 'mama', 'abuela', 'abuelo', 'tia', 'tio', 'prima', 'primo'];
const MAX_PHOTOS_PER_CATEGORY = 5;
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];
const FACE_MATCH_THRESHOLD = 0.5; // menor = más estricto

let faceMatcher = null;
let recognitionReady = false;

// Carga (si existen) las fotos de referencia y calcula su "huella facial".
async function loadFaceEnrollment() {
  const labeledDescriptors = [];

  for (const category of FACE_CATEGORIES) {
    const descriptors = [];
    for (let i = 1; i <= MAX_PHOTOS_PER_CATEGORY; i++) {
      for (const ext of PHOTO_EXTENSIONS) {
        const url = `assets/faces/${category}/foto${i}.${ext}`;
        try {
          const img = await faceapi.fetchImage(url);
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (detection) descriptors.push(detection.descriptor);
          break; // esta foto sí existía (con esta extensión); pasamos a la siguiente
        } catch (err) {
          // No existe assets/faces/<categoria>/fotoN.<ext> — seguimos intentando.
        }
      }
    }
    if (descriptors.length) {
      labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(category, descriptors));
    }
  }

  return labeledDescriptors;
}

async function loadFaceModels() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    state.modelsReady = true;
  } catch (err) {
    console.warn('No se pudieron cargar los modelos de detección facial:', err);
    state.modelsReady = false;
    return;
  }

  try {
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    const labeled = await loadFaceEnrollment();
    if (labeled.length) {
      faceMatcher = new faceapi.FaceMatcher(labeled, FACE_MATCH_THRESHOLD);
      recognitionReady = true;
    }
  } catch (err) {
    // Sin fotos de referencia o sin soporte: no pasa nada, se sigue preguntando por voz.
    console.warn('Reconocimiento facial no disponible, se preguntará por voz:', err);
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    return true;
  } catch (err) {
    console.warn('No se pudo acceder a la cámara:', err);
    cameraStatus.textContent = 'No pudimos acceder a tu cámara. Puedes escribir quién eres abajo.';
    $('typeInsteadRow').hidden = false;
    return false;
  }
}

let detectionLoopHandle = null;

function stopDetectionLoop() {
  if (detectionLoopHandle) {
    clearTimeout(detectionLoopHandle);
    detectionLoopHandle = null;
  }
}

// Bucle de detección: revisa cada 600ms si hay un rostro frente a la cámara,
// e intenta reconocerlo si hay fotos de referencia cargadas.
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
      let result;
      if (recognitionReady) {
        result = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      } else {
        result = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
        );
      }

      if (result) {
        if (recognitionReady && result.descriptor && faceMatcher) {
          const match = faceMatcher.findBestMatch(result.descriptor);
          if (match.label !== 'unknown') {
            onPersonRecognized(match.label);
            return;
          }
        }
        onPersonDetected(); // no se reconoció: seguimos con la pregunta por voz
        return;
      }
    } catch (err) {
      // Silencioso: seguimos intentando
    }
    detectionLoopHandle = setTimeout(tick, 600);
  };
  tick();
}

// Se reconoció el rostro contra una foto de referencia: saltamos directo
// al mensaje personalizado, sin preguntar quién es.
function onPersonRecognized(category) {
  if (state.faceDetected) return;
  state.faceDetected = true;
  cameraStatus.textContent = '¡Ya sé quién eres!';
  const entry = MESSAGES[category] || MESSAGES.familiar;
  const message = randomFrom(entry.options);
  const voterName = CATEGORY_DISPLAY_LABEL[category] || entry.label;
  state.currentFamiliar = { category, label: entry.label, kicker: entry.kicker, message, voterName };
  babySpeak('¡Hola! Ya sé quién eres.', () => {
    showMessageScreen();
  });
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

const WELCOME_NARRATION =
  '¡Estamos a punto de conocernos! Acércate a la cámara, dile quién eres, y descubre un mensaje especial antes de votar si crees que será niño o niña.';

function startListeningForIdentity() {
  state.awaitingAnswer = true;
  listeningPulse.classList.add('is-on');
  micIndicator.classList.add('is-active');
  heardText.textContent = '';

  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    // Sin soporte de reconocimiento de voz: invita a escribir la respuesta.
    cameraStatus.textContent = 'Tu navegador no soporta reconocimiento de voz. Escribe abajo quién eres.';
    $('typeInsteadRow').hidden = false;
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

// Entrada manual alternativa (accesibilidad / sin micrófono).
$('btnTypeInstead').addEventListener('click', () => {
  $('typeInsteadRow').hidden = false;
  $('typeInsteadInput').focus();
});

$('btnTypeInsteadSend').addEventListener('click', submitTypedIdentity);
$('typeInsteadInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitTypedIdentity();
});

function submitTypedIdentity() {
  const val = $('typeInsteadInput').value.trim();
  if (!val) return;
  clearTimeout(state.retryTimer);
  state.awaitingAnswer = false;
  if (state.recognition) { try { state.recognition.stop(); } catch (e) {} }
  handleIdentityAnswer(val);
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
      'Prima, ya quiero jugar contigo. Sé que juntas viviremos aventuras increíbles.',
      'Gracias por esperarme con tanto cariño. Pronto compartiremos muchas risas juntas.',
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

// Nombres de respaldo para mostrar en la votación cuando no se logra
// extraer un nombre propio de lo que la persona dijo o escribió.
const CATEGORY_DISPLAY_LABEL = {
  papa: 'Papá Edras',
  mama: 'Mamá',
  abuela: 'Abuela',
  abuelo: 'Abuelo',
  tia: 'Tía',
  tio: 'Tío',
  prima: 'Prima',
  primo: 'Primo',
  familiar: 'Invitado',
};

// Intenta sacar un nombre propio de frases como "Soy su tía Marcela"
// (quedaría "Marcela"). Si no encuentra nada usable, usa un nombre de
// respaldo según la categoría (ej. "Tía").
function extractDisplayName(rawText, category) {
  const cleaned = (rawText || '')
    .replace(/^\s*(soy|es)\s+/i, '')
    .replace(/^\s*(su|el|la|los|las)\s+/i, '')
    .replace(/^(pap[aá]|papi|mam[aá]|mami|abuela|abuelo|t[ií]a|t[ií]o|prima|primo)\s*/i, '')
    .trim();

  if (cleaned.length > 1 && cleaned.length < 40) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return CATEGORY_DISPLAY_LABEL[category] || 'Invitado';
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

function handleIdentityAnswer(rawText) {
  state.awaitingAnswer = false;
  const category = classifyIdentity(rawText);
  const entry = MESSAGES[category];
  const message = randomFrom(entry.options);
  const voterName = extractDisplayName(rawText, category);
  state.currentFamiliar = { category, label: entry.label, kicker: entry.kicker, message, voterName };
  showMessageScreen();
}

/* ---------------------------------------------------------------------
   7. FLUJO DE PANTALLAS
   --------------------------------------------------------------------- */
const screens = {
  welcome: $('screenWelcome'),
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

// --- Pantalla 0 -> 1: iniciar experiencia, todo automático ---
// La cámara aparece de inmediato; el audio de bienvenida suena al mismo
// tiempo, mientras la cámara ya está buscando/reconociendo un rostro
// (no se espera a que termine el audio para mostrarla).
let welcomeStarted = false;

function startWelcomeFlow() {
  if (welcomeStarted) return;
  welcomeStarted = true;

  showScreen('camera');
  narratorSpeak(WELCOME_NARRATION); // suena en paralelo, no bloquea nada

  (async () => {
    // Cargamos los modelos (incluye reconocimiento facial, si hay fotos) en
    // paralelo con el permiso/inicio de cámara, para no sumar esperas.
    const [, ok] = await Promise.all([loadFaceModels(), startCamera()]);
    if (ok) runDetectionLoop();
  })();
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(startWelcomeFlow, 300);
});

// Algunos navegadores (sobre todo en celular) bloquean el audio automático
// hasta el primer toque en la pantalla. Este respaldo silencioso lo dispara
// con el primer toque/clic/tecla, sin necesitar un botón visible.
document.addEventListener('click', startWelcomeFlow, { once: true });
document.addEventListener('keydown', startWelcomeFlow, { once: true });
document.addEventListener('touchstart', startWelcomeFlow, { once: true });

// --- Pantalla 2: mensaje personalizado ---
function showMessageScreen() {
  showScreen('message');
  $('messageKicker').textContent = state.currentFamiliar.kicker;
  $('messageText').textContent = state.currentFamiliar.message;
  // Voz de bebé: el mensaje personalizado se narra como si hablara el bebé.
  babySpeak(state.currentFamiliar.message);
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
  setTimeout(restartForNextPerson, 5000);
}

function restartForNextPerson() {
  // Reinicia el flujo para que otra persona participe, sin recargar la cámara.
  state.faceDetected = false;
  state.selectedVote = null;
  state.currentFamiliar = null;
  voteOptions.forEach((b) => b.classList.remove('is-selected'));
  $('typeInsteadInput').value = '';
  $('typeInsteadRow').hidden = true;
  cameraStatus.textContent = 'Buscando a alguien frente a la cámara…';
  showScreen('camera');
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
