# Fotos de referencia para reconocimiento facial (opcional)

Esta carpeta permite que la app **reconozca automáticamente** a un familiar
por su rostro y salte directo al mensaje personalizado, sin tener que
preguntarle "¿quién eres tú?" por voz.

**Es completamente opcional.** Si no agregas ninguna foto, la app sigue
funcionando exactamente igual que antes (preguntando por voz a cada
persona). Esto es solo un atajo extra para quienes quieras que reconozca
de inmediato.

## Cómo agregar fotos

1. Elige la carpeta de la categoría correspondiente:
   `papa`, `mama`, `abuela`, `abuelo`, `tia`, `tio`, `prima`, `primo`.
2. Dentro de esa carpeta, guarda las fotos con el nombre exacto:
   `foto1.jpg`, `foto2.jpg`, `foto3.jpg`, etc. (hasta `foto5`).
   También aceptan `.jpeg` o `.png` en vez de `.jpg`.
3. Sube esas fotos junto con el resto del proyecto a GitHub.

Ejemplo para que reconozca a "papá Edras":
```
assets/faces/papa/foto1.jpg
assets/faces/papa/foto2.jpg
```

## Recomendaciones para mejores resultados

- 2 o 3 fotos por persona, no solo una — ayuda a que reconozca distintos
  ángulos y condiciones de luz.
- Fotos de frente, con buena luz, sin lentes de sol ni el rostro cubierto.
- Si la foto tiene varias personas, la app usa el primer rostro que detecte
  en ella — mejor usar fotos donde salga una sola persona.

## Qué pasa si no reconoce a alguien

Ningún problema: si la app no encuentra una foto que coincida (por ejemplo,
un invitado sin foto registrada, o mala luz), simplemente sigue con la
pregunta por voz de siempre — la experiencia nunca se traba.
