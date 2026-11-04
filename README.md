# Menúu · consumidores

App de estudiantes y cocinas con catálogo semanal, personalización, reservas, pedidos y estadísticas. La fuente de verdad es **libSQL**: un archivo SQLite en local y una base **Turso** remota en producción. La lista de espera de `menuu-landing` usa otra base Turso independiente.

## Desarrollo local

Requiere Node.js 22.13 o posterior. No requiere Docker ni PostgreSQL.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Abre [http://127.0.0.1:5174/#inicio](http://127.0.0.1:5174/#inicio). Sin `TURSO_DATABASE_URL`, los datos se guardan en `local.db` dentro de este proyecto. `npm run dev` aplica el esquema y no crea usuarios, cocinas ni ofertas ficticias. La base local anterior de PostgreSQL quedó archivada; la cuenta de estudiante que no era de muestra se conservó en `local.db`.

| Comando               | Función                                                       |
| --------------------- | ------------------------------------------------------------- |
| `npm run dev`         | Sirve API y frontend con Vite.                                |
| `npm run build`       | Compila el frontend.                                          |
| `npm start`           | Sirve la versión compilada.                                   |
| `npm run db:migrate`  | Aplica las migraciones libSQL pendientes.                     |
| `npm run test:libsql` | Prueba el esquema y los flujos críticos en una base temporal. |

Las cuentas de estudiante se registran con `@utec.edu.pe`, código único de nueve dígitos o un código PRE. Se admiten `0000PREXX000000` (ceros y equis son dígitos), el formato anterior de 14 caracteres y `20261PREEN01008` (cinco dígitos, PRE, dos letras y cinco dígitos). El acceso de cocina requiere una cuenta asignada internamente a su cocina; no existe registro público de cocinas.

## Vercel y Turso

Configura **Root Directory** como `menuu-consumidores`. El proyecto ya incluye `vercel.json` y una función para `/api/*`. Crea una base Turso **para consumidores**; no reutilices la base de inscripciones de la landing. En Vercel configura estas variables para Production y Preview:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

La función aplica las migraciones al recibir su primera petición. Una base nueva comienza sin usuarios ni menús. No subas `local.db`, `.env` ni el token al repositorio. Comprueba `/api/bootstrap` en la URL desplegada: debe responder JSON con `catalog.kitchens` y `catalog.offerings`, inicialmente vacíos. Si devuelve un error, revisa los registros de la función en Vercel.

La app guarda reservas en transacciones de escritura libSQL. Cada reserva comprueba otra vez el plazo y el cupo, actualiza el stock de forma condicionada y crea el pedido en la misma transacción. Una clave de solicitud hace seguros los reintentos. El servidor valida también las opciones de personalización y los precios. Las reservas previas requieren Yape al QR de Fernando Wilder Altamirano Pinedo y un comprobante PNG/JPG. El cupo se aparta durante 15 minutos para subirlo; admin contrasta el movimiento recibido y aprueba o rechaza el pago. La web no ejecuta el yapeo. Tras aprobarlo, solo falta registrar la entrega. Los medios de pago anteriores permanecen y las ventas adicionales en el recojo registran su propio método.

## Avisos de recojo

El carrito ofrece activar notificaciones opcionales antes de confirmar la reserva. El permiso se pide solo al tocar «Activar avisos»; rechazarlo no impide reservar. Cinco minutos antes de la hora inicial de recojo, el servidor envía un aviso a cada dispositivo suscrito del estudiante, siempre que el pedido siga pendiente y no esté cancelado. La tabla `push_reminders` evita duplicados. Cerrar sesión desactiva los avisos de ese dispositivo.

Para **Vercel Pro**, genera una vez las claves con `npx web-push generate-vapid-keys` y copia en las variables de entorno de **Production** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:correo-real@utec.edu.pe` (usa una dirección real de contacto) y `CRON_SECRET` (secreto aleatorio de al menos 24 caracteres). `vercel.json` registra `/api/push/dispatch` de lunes a sábado a las **17:55 UTC = 12:55 p.m. de Lima** y `/api/fridge/cleanup` todos los días a las **05:05 UTC = 12:05 a.m. de Lima**. El segundo elimina de la base las fotos de pedidos dejados en refri al día siguiente del recojo; además, cada lectura de pedidos y de la foto aplica la caducidad. Vercel envía automáticamente `CRON_SECRET` como cabecera Bearer y ambos endpoints la comprueban. Si en el futuro se publica otra hora de recojo, habrá que ampliar el horario del cron de avisos. Después de configurar las variables, despliega a Production y comprueba los cron y sus registros en Vercel. Los cron no se ejecutan en despliegues Preview.

No publiques la clave privada ni cambies el par VAPID después de que alguien se suscriba. La base Turso guarda las suscripciones por usuario y dispositivo. Sin las cuatro variables, el botón de activación permanece oculto y el endpoint no envía avisos. Las notificaciones web requieren HTTPS (o `localhost` para pruebas). En iPhone/iPad, el estudiante debe añadir la app a la pantalla de inicio antes de activar los avisos. La entrega final también depende del sistema operativo y del servicio push del dispositivo.

## Datos y reglas

El esquema nuevo está en `server/migrations/0001_initial.sql`. Las migraciones PostgreSQL anteriores se conservan solo como referencia en `docs/postgres-migrations/`; ya no se ejecutan. Consulta [docs/arquitectura-datos.md](docs/arquitectura-datos.md) para las tablas y garantías de datos.

Los consumidores ven esta semana y la siguiente. Una cocina puede publicar platos solo en ciertos días de lunes a sábado. Cada oferta tiene fecha, ventana de recojo, cierre de reserva y capacidad propios. Los pedidos marcados como entregados permiten calcular ventas; las reseñas requieren además una habilitación interna y la hora de entrega cumplida. La habilitación de reseñas por un usuario con permisos especiales sigue pendiente.

## Administración

El tercer rol, `admin`, entra por `#admin` y ve los pedidos de la semana actual y la siguiente de todas las cocinas. Su bandeja de Yapes por revisar es independiente de la lista de entregas; puede ver el comprobante y aprobar o rechazar con motivo. También puede ajustar cupos y gestionar altas manuales, entregas, ausencias y pagos de ventas en el recojo. Las cocinas siguen limitadas a sus propios menús. Ambos paneles permiten actualizar la lista de estudiantes cuando alguien acaba de registrarse. Una cuenta ya añadida aparece con ese aviso y, si su Yape está aprobado, puede comprar otra porción durante el recojo con un pago separado. No existe registro público de admins.

Para crear una cuenta admin, define `MENUU_ADMIN_DATABASE_URL` con la URL libSQL elegida, `MENUU_ADMIN_EMAIL` y `MENUU_ADMIN_PASSWORD` (mínimo 12 caracteres); para Turso remoto define además `MENUU_ADMIN_AUTH_TOKEN`. Ejecuta `npm run admin:create`. El comando exige la URL explícita y no imprime la contraseña. Comprueba que la URL corresponde al entorno deseado antes de ejecutarlo.
