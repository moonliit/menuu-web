# Arquitectura de datos de Menúu consumidores

## Motor y entornos

`server/db.mjs` usa `@libsql/client`. En local abre `file:local.db` si no se define `TURSO_DATABASE_URL`; en Vercel exige una URL Turso remota y `TURSO_AUTH_TOKEN`. La landing utiliza otra base Turso para su lista de espera. Ninguna consulta de consumidores depende de la tabla de inscripciones.

`scripts/migrate.mjs` aplica los archivos de `server/migrations/` dentro de transacciones de escritura y registra cada versión en `schema_migrations`. El esquema actual está consolidado en `0001_initial.sql`. Los archivos de `docs/postgres-migrations/` son historia de la implementación anterior; no se ejecutan. El arranque no agrega datos ficticios.

## Tablas

| Tabla                                                   | Contenido                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users`, `sessions`                                     | Estudiantes, cocinas, admins y sesiones persistentes; contraseñas con `scrypt`. |
| `admin_offer_events`                                    | Cambios de cupo hechos por admin, con actor y fecha.                            |
| `kitchens`, `kitchen_images`                            | Perfil y fotos de cocina.                                                       |
| `dishes`, `option_groups`, `option_choices`             | Catálogo base y personalización.                                                |
| `offers`, `offer_option_groups`, `offer_option_choices` | Publicación por día, horario, cupo y variantes.                                 |
| `orders`, `order_items`, `order_item_choices`           | Reserva y copia histórica de platos, opciones y precios.                        |
| `booking_requests`                                      | Claves de idempotencia para reintentos.                                         |
| `order_reviews`, `order_item_reviews`                   | Notas de 1 a 5 tras entrega habilitada.                                         |

Los importes se guardan como céntimos enteros. Fechas de día se guardan como `YYYY-MM-DD`, horarios de Lima como `HH:MM` y momentos absolutos como ISO 8601 UTC. Así se comparan cierres de reserva sin depender de la zona horaria del servidor. Los booleanos se guardan como enteros 0/1 y se convierten al leerlos.

## Reserva y concurrencia

`createBooking` abre una transacción libSQL de tipo `write` antes de leer las ofertas. Verifica el cupo y el cierre, valida opciones y precios, actualiza cada oferta con una condición de capacidad y guarda pedidos e ítems. Una falla revierte la operación completa. Las transacciones de escritura se serializan dentro del proceso y se reintenta de forma acotada si SQLite devuelve `SQLITE_BUSY`; entre instancias remotas la propia base coordina las escrituras. Dos solicitudes simultáneas sobre la última porción no pueden confirmar ambas. `booking_requests` devuelve el resultado previo si se reenvía la misma solicitud con la misma clave.

Las cuentas públicas solo pueden registrarse con `@utec.edu.pe`, carrera válida y código de estudiante único de nueve dígitos o formato PRE. Se admiten `0000PREXX000000` (ceros y equis representan dígitos), los códigos PRE anteriores de 14 caracteres y `20261PREEN01008` (cinco dígitos, PRE, dos letras y cinco dígitos). La sesión y el rol se verifican en el servidor para cada acción protegida. Las escrituras de cocina filtran por el `kitchen_id` asociado al usuario. Las imágenes PNG/JPG subidas por cocinas se guardan como BLOB y se sirven con MIME comprobado.

En Menús, cada cocina ve los nombres, correos, cantidades, fecha y hora de registro y estados de las reservas de sus ofertas. El botón «Entregas» abre esa gestión. Cada reserva comienza «Pendiente» y conserva ese estado después de la ventana de recojo hasta que la cocina la marque explícitamente como entregada o como ausencia. También registra el medio de pago efectuado. No existe una confirmación intermedia de asistencia; la migración `0007_remove_attendance_confirmation.sql` limpia ese dato anterior. Puede añadir manualmente un estudiante registrado que todavía no tenga reserva en esa oferta, siempre que quede cupo, incluso después de la hora de recojo como reserva extraordinaria. La fecha y hora quedan guardadas en el pedido y cada cambio en `kitchen_reservation_events` con el usuario de cocina que lo realizó. Una reserva extraordinaria posterior al recojo no se marca como ausencia de esa ventana. El punto de recojo se guarda como «Entrada del Comedor UTEC en piso 2»; la migración actualiza los pedidos anteriores.

Una ausencia `no_show` permanece en el historial y restringe nuevas reservas del estudiante, pero sus porciones dejan de ocupar `offers.reserved_count` y no suman en las métricas de reservas. La migración `0004_reconcile_absences.sql` ajusta las ofertas que ya tenían ausencias. Al corregir una ausencia, el servidor restaura el cupo dentro de la misma transacción o rechaza el cambio si otra reserva ocupó esas porciones. En Menús se puede filtrar el historial por estado y método de pago registrado.

## Entrega, reseñas y trabajo pendiente

Los pedidos empiezan con `fulfillment_status='pending'` y `review_enabled=0`. Una reseña requiere estado `delivered`, permiso explícito, hora de entrega cumplida y una nota para cada plato; se admite una vez por pedido. Solo `no_show` restringe futuras reservas. El panel admin ya gestiona entregas y ausencias de todas las cocinas; la habilitación de reseñas permanece pendiente.

## Rol admin

La migración `0011_admin_role.sql` permite `users.role='admin'` sin `kitchen_id` y crea `admin_offer_events`. No se pueden registrar admins desde la web. El acceso `#admin` usa la sesión existente; `/api/admin/*` comprueba el rol en cada petición. El dashboard consulta ofertas y pedidos de la semana actual y siguiente de todas las cocinas, y filtra por semana y cocina. Al ajustar cupos se valida el mínimo reservado dentro de una transacción y se registra actor, cupo anterior, cupo nuevo y fecha. Las altas manuales y cambios de entrega reutilizan las transacciones de cocina, que verifican el `kitchen_id` real del menú o pedido y auditan el actor en `kitchen_reservation_events`. Las cocinas conservan acceso únicamente a su propia cocina.

Los dos paneles consultan de nuevo los estudiantes elegibles al pulsar «Actualizar estudiantes». Así se incluye una cuenta creada después de abrir la pantalla, sin recargar toda la página.

Antes de atender reservas reales, configura copias de seguridad, supervisión y el token de Turso en el entorno de producción. La verificación automatizada `npm run test:libsql` usa una base temporal: comprueba migraciones, catálogo, registro, sesión, cupos concurrentes, idempotencia, estadísticas, imágenes y reseñas.
