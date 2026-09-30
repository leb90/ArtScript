# Publicar en npm (cuando el MVP esté estable)

**Todavía no se publica.** `package.json` tiene `"private": true`, que bloquea `npm publish` por accidente.

## Qué ya está listo

- Nombres libres en npm (verificado 2026-09-30): `artscript` y `create-artscript`.
- `npm run build` compila `src/*.ts` → `lib/*.js` + tipos `.d.ts`. Node no ejecuta TypeScript dentro de `node_modules`, así que el paquete publica JS.
- `bin: art → lib/cli.js`, `files` (lib, runtime, templates, docs/SPEC.md), `exports`, `engines: node >=24`, licencia MIT, repo y metadatos.
- `prepack` compila automáticamente; `prepublishOnly` corre tests + typecheck.
- Sin scripts de instalación (`postinstall`/`prepare`): npm no muestra advertencias de seguridad al instalar.
- Probado: `npm pack` → instalar el `.tgz` en un directorio vacío → `art init` → `npm install` → `check`, `build` y `dev` funcionan.

## Checklist antes de publicar

1. [ ] MVP estable: `api`/backend, `art patch`, `for` con key, `fmt` que preserve comentarios.
2. [ ] Eval de costo con agentes (`npm run eval`) con resultado favorable.
3. [ ] Decidir versión inicial (`0.1.0` señala "experimental"; semver 0.x permite cambios que rompen).
4. [x] README en inglés.
5. [ ] Crear el paquete `create-artscript` para que funcione `npm create artscript@latest mi-app` (hoy existe `npx art init mi-app`).
6. [ ] Quitar `"private": true` de `package.json`.
7. [ ] `npm login` (cuenta npm del autor, con 2FA).
8. [ ] `npm publish --access public` (usar `--dry-run` primero).
9. [ ] Tag en git: `git tag v0.1.0 && git push --tags`.

## Probar el paquete localmente sin publicar

```sh
npm pack                                   # genera artscript-0.1.0.tgz
cd /tmp && mkdir prueba && cd prueba
npm init -y && npm i /ruta/a/artscript-0.1.0.tgz
npx art init mi-app
```

`art init` ejecutado desde el repo (no instalado) crea el proyecto apuntando a la copia local (`file:`); instalado desde npm apunta a `^<versión>`.
