# Instrucciones para agentes de IA

Este proyecto usa **ArtScript** (archivos `.art` en `src/`). La spec completa del lenguaje está en `ARTSCRIPT.md`: leela antes de escribir código.

- Verificá cada cambio con `npx art check --ai`: devuelve errores como JSON con `fixes` sugeridos.
- Para entender una parte sin leer todo: `npx art context` (mapa del proyecto) o `npx art context <Componente>`.
- Formato canónico: `npx art fmt --write`.
- Las expresiones son JavaScript; solo la estructura (`page`, `component`, `model`, `state`, `computed`, `fn`, vista) es propia.
