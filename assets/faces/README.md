# Fotos de referencia para reconocimiento facial (opcional)

Esta carpeta permite que la app **reconozca automáticamente** a cada
familiar por su rostro y salte directo a su mensaje personalizado,
diciendo su nombre real, sin tener que preguntarle "¿quién eres tú?" por
voz.

**Es completamente opcional.** Si no agregas ninguna foto, la app sigue
funcionando exactamente igual (preguntando por voz a cada persona).

## Cómo está organizado

A diferencia de antes, aquí **cada persona tiene su propia carpeta**
(no cada parentesco) — así se puede distinguir, por ejemplo, entre
"Abuela María" y "Abuela Rosa", o entre las distintas tías.

Carpetas ya creadas y listas para usar:

| Persona | Carpeta |
|---|---|
| Papá Edras | `papa` |
| Mamá Nazareth | `mama` |
| Abuela María | `abuela_maria` |
| Abuela Maricela | `abuela_maricela` |
| Abuela Rosa | `abuela_rosa` |
| Abuelo | `abuelo` |
| Tía Brenda | `tia_brenda` |
| Tía Karina | `tia_karina` |
| Tía Nelcy | `tia_nelcy` |
| Tía Glenda | `tia_glenda` |
| Tío Osman | `tio_osman` |
| Tío Juan | `tio_juan` |
| Tío Eduardo | `tio_eduardo` |
| Primo Abdiel | `primo_abdiel` |
| Prima Addy | `prima_addy` |
| Prima Amsy | `prima_amsy` |
| Prima Kory | `prima_kory` |
| Prima Alexandra | `prima_alexandra` |

## Cómo agregar fotos

1. Entra a la carpeta de esa persona (de la tabla de arriba).
2. Guarda su foto con el nombre exacto: `foto1.jpg` (o `foto2.jpg`,
   `foto3.jpg`... si agregas más de una). También aceptan `.jpeg` o `.png`.
3. Sube esa foto a GitHub (Add file → Upload files → Commit changes).

Ejemplo para que reconozca a "Tía Brenda":
```
assets/faces/tia_brenda/foto1.jpg
```

## Si quieres agregar a alguien que no está en la lista

Además de crear su carpeta aquí, hay que agregarla en el archivo
`script.js`, en la lista `PEOPLE` (cerca de la mitad del archivo). Cada
persona se ve así:
```js
{ id: 'tia_brenda', category: 'tia', name: 'Brenda' },
```
- `id`: debe ser igual al nombre de su carpeta.
- `category`: una de `papa`, `mama`, `abuela`, `abuelo`, `tia`, `tio`,
  `prima`, `primo` (define qué mensajes le va a decir el bebé).
- `name`: su nombre real, para el saludo ("Eres mi tía Brenda.") y para la
  votación ("Votando como Tía Brenda").

## Recomendaciones para mejores resultados

- 2 o 3 fotos por persona, no solo una.
- Fotos de frente, con buena luz, sin lentes de sol.
- Una sola persona por foto (si hay varias, usa la primera cara que
  detecte, y puede confundirse).

## Qué pasa si no reconoce a alguien

Ningún problema: si no hay foto de esa persona, o no coincide bien, la app
simplemente sigue con la pregunta por voz de siempre.
