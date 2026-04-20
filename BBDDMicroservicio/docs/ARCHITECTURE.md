# BBDD Service - Arquitectura Interna

## Visión General

El BBDD Service es un **microservicio de persistencia puro** que:

1. **Escucha** en RabbitMQ por operaciones de BD
2. **Ejecuta** CRUD sobre SQLite
3. **Responde** vía RPC con resultados o errores
4. **Expone** también endpoints HTTP para lecturas rápidas

```
API Gateway (HTTP + RabbitMQ) 
    ├─ GET /stats                    ← HTTP directo (rápido)
    ├─ POST /api/query              ← RabbitMQ (/stats hace query)
    └─ RabbitMQ (user.create)        ← RPC Request/Reply
        ↓
    BBDD Service
    ├─ HTTP: GET /stats             ← Responde lectura rápida
    ├─ RabbitMQ Consumer            ← Escucha bbdd.requests
    └─ SQLite                        ← Ejecuta operación
        ↓
    gateway.reply queue             ← Envía respuesta con correlationId
```

## Componentes

### 1. Conexión (src/db/connection.js)

```javascript
// Única instancia de conexión
let dbInstance = null;

export async function connectDB() {
  dbInstance = await open({
    filename: config.get('db.filename'),
    driver: sqlite3.Database
  });
  
  // Crear tablas automáticamente
  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS Usuarios ...`);
}

export function getDB() {
  return dbInstance;
}
```

**Características:**
- Una sola conexión a SQLite (no pool, SQLite es single-threaded)
- Auto-crea tablas en startup
- Función `getDB()` para acceso desde servicios

### 2. Servicios (src/services/)

#### userService.js
```javascript
async function getUserbyUsername(username)     // SELECT by username
async function getUserbyEmail(email)           // SELECT by email
async function getUserById(userId)             // SELECT by id
async function createUser(u, e, p)             // INSERT
async function updateUser(userId, updates)     // UPDATE
async function deleteUser(userId)              // DELETE
async function getSystemStats()                // COUNT queries
```

**Características:**
- Funciones puras (reciben parámetros, retornan resultados)
- Lanzán excepciones con estructura: `{ status: 400, message: '...' }`
- Todas las contraseñas hasheadas con bcrypt antes de guardar
- No exponen contraseñas en respuestas

#### tokenService.js
```javascript
async function revokeToken(token, expiresAt)   // INSERT revoked
async function isTokenRevoked(token)           // SELECT revoked
async function cleanExpiredTokens()            // DELETE expired
async function getRevokedTokensStats()         // COUNT queries
```

**Características:**
- Manejo de tokens revocados (blacklist)
- Limpieza automática de tokens expirados
- Verificación rápida de revocación

### 3. Consumer RabbitMQ (src/consumers/dbConsumer.js)

```
┌─────────────────────────────────────────────────┐
│ RabbitMQ Consumer                               │
│                                                 │
│ 1. Conecta a RabbitMQ                           │
│ 2. Crea cola bbdd.requests (durable)            │
│ 3. Prefetch 1 (procesa un mensaje a la vez)     │
│ 4. Consume y procesa                            │
│    ├─ Parsea JSON                              │
│    ├─ Extrae operation                         │
│    ├─ Llama a servicio correspondiente         │
│    └─ Envía respuesta via gateway.reply        │
│ 5. Acknowledge del mensaje                      │
└─────────────────────────────────────────────────┘
```

**Flujo de mensaje:**

```
Gateway sendToQueue(bbdd.requests)
{
  operation: "user.create",
  payload: { username, email, password },
  correlationId: "abc-123"
}
        ↓
  RabbitMQ Consumer
        ↓
  processRequest(operation, payload)
        ↓
  Ejecuta userService.createUser()
        ↓
  Genera respuesta
        ↓
  sendToQueue(gateway.reply, response, correlationId)
        ↓
  Gateway correlationId match → Promise resuelto
```

**Operaciones soportadas:**

```javascript
switch (operation) {
  case 'user.get_by_username':
  case 'user.get_by_email':
  case 'user.get_by_id':
  case 'user.create':
  case 'user.update':
  case 'user.delete':
  case 'token.revoke':
  case 'token.is_revoked':
  case 'stats.system':
  // ...
}
```

### 4. Rutas HTTP (src/routes/api.routes.js)

Para operaciones **rápidas de lectura**:

```javascript
GET /users/username/:username      // 1-5ms
GET /users/email/:email            // 1-5ms
GET /users/:id                     // 1-5ms
GET /stats                         // 5-10ms
GET /stats/tokens                  // 5-10ms
POST /tokens/verify                // 1-5ms
```

**Ventajas de HTTP directo:**
- Latencia mínima
- No necesita RabbitMQ
- Simple de debuggear
- Cacheable por proxies

**No hay endpoints POST/PATCH/DELETE** porque las mutaciones van vía RabbitMQ.

### 5. Bootstrap (src/bbdd-service.js)

```javascript
async function startBBDDService() {
  1. connectDB()              ← Inicializar SQLite
  2. startDBConsumer()        ← Inicializar RabbitMQ
  3. setupRoutes()            ← Registrar endpoints HTTP
  4. fastify.listen()         ← Escuchar puerto 3003
  5. Manejo de SIGTERM/SIGINT ← Graceful shutdown
}
```

## Flujos de Datos

### Flujo 1: Crear Usuario (escritura via RabbitMQ)

```
API Gateway (recibió POST /auth/register)
    │
    ├─ Valida entrada
    │
    └─ sendRPCRequest(queue='bbdd.requests', {
         operation: 'user.create',
         payload: { username, email, hashedPassword }
       })
           │
           ↓ RabbitMQ
        bbdd.requests queue
           │
           ↓ BBDD Consumer
        getUserbyUsername() [checks duplicates]
           │
           ├─ Si existe
           │  └─ Throw { status: 400, message: 'Username taken' }
           │
           └─ Si no existe
              ├─ Hash password
              ├─ INSERT Usuarios
              ├─ INSERT OperationLogs
              └─ Return { id, username, email, created_at }
                   │
                   ↓ RabbitMQ
                gateway.reply queue (correlationId match)
                   │
                   ↓ Gateway Promise resolves
                   │
                   └─ Return to client
```

### Flujo 2: Obtener Stats (lectura via HTTP)

```
API Gateway
    │
    └─ GET /api/stats
        │
        ├─ statsService.get('/stats')
        │
        └─ HTTP llamada directa a BBDD Service
               │
               ↓ BBDD Service
            GET /stats
               │
               ├─ SELECT COUNT(*) FROM Usuarios
               ├─ SELECT COUNT(*) FROM RevokedTokens
               ├─ SELECT COUNT(*) FROM OperationLogs (últimas 24h)
               │
               └─ Return { total_users, revoked_tokens, operations_24h }
                    │
                    ↓ HTTP Response
                    │
                    └─ Gateway → Client
```

### Flujo 3: Verificar Token (lectura rápida)

```
Auth Service valida JWT
    │
    └─ isTokenRevoked(token)
        │
        └─ HTTP POST /tokens/verify
               │
               ↓ BBDD Service
            SELECT FROM RevokedTokens WHERE token = ?
               │
               └─ Return { revoked: true/false }
                    │
                    └─ Auth Service acepta o rechaza
```

## Manejo de Errores

### Escenario 1: Usuario ya existe

```
Operación: user.create
Entrada: { username: "jorge", ... }

BBDD Service:
  getUserbyUsername("jorge")
    ↓
  Encuentra usuario
    ↓
  Lanza:
  {
    status: 400,
    message: 'El nombre de usuario ya está en uso'
  }
    ↓
  Consumer atrapa error
    ↓
  Envía a gateway.reply:
  {
    error: 'El nombre de usuario ya está en uso',
    status: 400
  }
    ↓
  Gateway retorna 400 al cliente
```

### Escenario 2: Operación desconocida

```
RabbitMQ recibe:
{
  operation: "invalid.operation",
  payload: { ... }
}
    ↓
  Consumer switch()
    ↓
  default case:
  {
    status: 400,
    message: 'Unknown operation: invalid.operation'
  }
    ↓
  Gateway recibe error 400
```

## Auditoría (OperationLogs)

Cada operación se registra:

```sql
INSERT INTO OperationLogs (
  operation,        -- 'CREATE', 'UPDATE', 'DELETE'
  entity_type,      -- 'USER', 'TOKEN'
  entity_id,        -- ID del usuario afectado
  status,           -- 'SUCCESS', 'FAILED'
  message           -- Detalles opcionales
)
```

**Ejemplo:**
```
operation='CREATE'
entity_type='USER'
entity_id=42
status='SUCCESS'
```

Permite:
- Auditoría de cambios
- Debugging de problemas
- Análisis de actividad

## Testing

### Con HTTPClient (curl)

```bash
# Obtener usuario
curl http://localhost:3003/users/username/jorge

# Ver stats
curl http://localhost:3003/stats

# Health check
curl http://localhost:3003/health/ready
```

### Con RabbitMQ (Message Queue)

```bash
# Ver colas en RabbitMQ Management
http://rabbitmq:15672
  ↓
  Queues
  ↓
  bbdd.requests (durable: true)
  gateway.reply (transient)
```

### Con SQLite directo

```bash
sqlite3 bbdd.db

sqlite> SELECT * FROM Usuarios;
sqlite> SELECT COUNT(*) FROM Usuarios;
sqlite> SELECT * FROM OperationLogs ORDER BY created_at DESC LIMIT 10;
```

## Comparación: HTTP vs RabbitMQ

| Aspecto | HTTP | RabbitMQ |
|---------|------|----------|
| **Latencia** | <10ms | <100ms |
| **Bloqueante** | Sí | No (async) |
| **Persistence** | No | Sí (si falla, reintenta) |
| **Escalabilidad** | Difícil | Fácil (múltiples consumers) |
| **Debugging** | Fácil | Complejo |
| **Ideal para** | Lecturas rápidas | Escrituras largas |

## Caso de Uso: Escalabilidad

Si `createUser()` tardara 5 minutos:

```
Opción A: HTTP directo
    ├─ Cliente espera 5 minutos
    └─ Timeout probable

Opción B: RabbitMQ
    ├─ Cliente recibe respuesta inmediata
    ├─ BBDD Service procesa en background
    └─ Cliente puede hacer polling en /api/query/status/<id>
```

Aquí RabbitMQ gana porque desacopla.

## Evolución Futura

- [ ] Migrar a PostgreSQL (SQLite single-threaded)
- [ ] Implementar replicación (backup automático)
- [ ] Caché Redis para acceso frecuente
- [ ] Índices en tablas grandes
- [ ] Particionamiento de datos por usuario
- [ ] Eventos de cambio (CDC - Change Data Capture)
