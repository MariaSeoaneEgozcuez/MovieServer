# BBDD Service - Microservicio de Persistencia

## Descripción

Microservicio responsable de **toda la persistencia de datos** en MovieServer. Gestiona:

- ✅ **Usuarios**: Crear, actualizar, leer
- ✅ **Tokens**: Revocar, verificar estado
- ✅ **Estadísticas**: Contar usuarios, tokens revocados, operaciones
- ✅ **Auditoría**: Log de todas las operaciones

## Comunicación

### Doble canal de comunicación:

```
API Gateway
    ├─ HTTP directo (GET /users, GET /stats)        ← Lectura rápida
    └─ RabbitMQ (user.create, token.revoke)         ← Escritura async
```

### Patrones implementados:

1. **HTTP directo** para consultas (GET)
2. **RabbitMQ Request/Reply** para mutaciones (CREATE, UPDATE, DELETE)

## Estructura

```
src/
├── bbdd-service.js           ← Bootstrap principal
├── db/
│   └── connection.js         ← Conexión SQLite
├── services/
│   ├── userService.js        ← CRUD usuarios
│   └── tokenService.js       ← Operaciones con tokens
├── consumers/
│   ├── dbConsumer.js         ← RabbitMQ listener
│   └── utils.js              ← Utilidades
└── routes/
    └── api.routes.js         ← Endpoints HTTP

config/
└── default.json              ← Configuración
```

## Instalación

```bash
npm install
```

## Configuración

Editar `config/default.json`:

```json
{
  "bbdd": {
    "port": 3003,
    "host": "0.0.0.0"
  },
  "db": {
    "filename": "./bbdd.db",
    "poolSize": 5
  },
  "rabbitmq": {
    "url": "amqp://guest:guest@rabbitmq:5672",
    "prefetch": 1
  }
}
```

## Ejecución

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

## Docker

```bash
docker build -t bbdd-service:latest .
docker run -p 3003:3003 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  -v bbdd_data:/usr/src/app \
  bbdd-service:latest
```

## Endpoints HTTP

### Usuarios

#### GET `/users/username/:username`
Obtener usuario por username (sin contraseña)

```bash
curl http://localhost:3003/users/username/jorge
```

Response:
```json
{
  "id": 1,
  "username": "jorge",
  "email": "jorge@example.com"
}
```

#### GET `/users/email/:email`
Obtener usuario por email

```bash
curl http://localhost:3003/users/email/jorge@example.com
```

#### GET `/users/:id`
Obtener usuario por ID

```bash
curl http://localhost:3003/users/123
```

### Tokens

#### POST `/tokens/verify`
Verificar si un token está revocado

```bash
curl -X POST http://localhost:3003/tokens/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"eyJhbGc..."}'
```

Response:
```json
{
  "revoked": false
}
```

### Estadísticas

#### GET `/stats`
Estadísticas completas del sistema

```bash
curl http://localhost:3003/stats
```

Response:
```json
{
  "total_users": 10,
  "revoked_tokens": 2,
  "operations_24h": 45,
  "timestamp": "2026-04-17T10:30:45.123Z"
}
```

#### GET `/stats/tokens`
Solo estadísticas de tokens

```bash
curl http://localhost:3003/stats/tokens
```

### Health

#### GET `/health`
Health check completo

```bash
curl http://localhost:3003/health
```

#### GET `/health/live`
Liveness probe

```bash
curl http://localhost:3003/health/live
```

#### GET `/health/ready`
Readiness probe

```bash
curl http://localhost:3003/health/ready
```

## RabbitMQ - Operaciones

### Queue: `bbdd.requests`

El API Gateway envía mensajes JSON con formato:

```json
{
  "operation": "user.create",
  "payload": {
    "username": "jorge",
    "email": "jorge@example.com",
    "password": "hashed_password"
  }
}
```

### Operaciones soportadas

#### Usuario
- `user.get_by_username` - Obtener usuario por nombre
- `user.get_by_email` - Obtener usuario por email
- `user.get_by_id` - Obtener usuario por ID
- `user.create` - Crear nuevo usuario
- `user.update` - Actualizar usuario
- `user.delete` - Eliminar usuario

#### Token
- `token.revoke` - Revocar un token
- `token.is_revoked` - Verificar si está revocado
- `token.clean_expired` - Limpiar tokens expirados
- `token.stats` - Obtener estadísticas de tokens

#### Estadísticas
- `stats.system` - Estadísticas del sistema
- `stats.tokens` - Estadísticas de tokens

### Ejemplo RPC

```javascript
// En API Gateway
const response = await queryService.post('/user/create', {
  username: 'jorge',
  email: 'jorge@example.com',
  password: 'hashed'
});

// BBDD Service recibe en bbdd.requests
// Procesa la operación
// Envía respuesta a gateway.reply con mismo correlationId
```

## Base de Datos

### Esquema SQLite

#### Tabla: Usuarios
```sql
CREATE TABLE Usuarios (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME
)
```

#### Tabla: RevokedTokens
```sql
CREATE TABLE RevokedTokens (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  revoked_at DATETIME,
  expires_at DATETIME
)
```

#### Tabla: OperationLogs (auditoría)
```sql
CREATE TABLE OperationLogs (
  id INTEGER PRIMARY KEY,
  operation TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  status TEXT,
  message TEXT,
  created_at DATETIME
)
```

## Características

✅ **Pool de conexiones SQLite**  
✅ **RabbitMQ RPC pattern** (Request/Reply)  
✅ **HTTP directo para lecturas**  
✅ **Auditoría de operaciones**  
✅ **Health checks multi-nivel**  
✅ **Graceful shutdown**  
✅ **Structured logging**  
✅ **Docker ready**  

## Flow: Crear usuario

```
1. API Gateway
   POST /auth/register
   { username, email, password }
   
2. Auth Service valida entrada
   → Envía RPC a BBDD Service
   
3. BBDD Service (RabbitMQ)
   - Verifica que no existe
   - Hash password con bcrypt
   - INSERT en Usuarios
   - Logea operación
   - Responde
   
4. API Gateway recibe respuesta
   → Retorna al cliente
```

## Flow: Verificar token

```
1. API Gateway
   GET /health/ready
   
2. Valida JWT localmente
   → Consulta BBDD Service
   
3. BBDD Service (HTTP)
   POST /tokens/verify
   { token }
   - SELECT en RevokedTokens
   
4. BBDD Service responde
   { revoked: false }
   
5. Si no revocado → permitir
```

## Testing Local

### Crear usuario (via RabbitMQ/HTTP)
```bash
# Primero registrar via API Gateway
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'

# Verificar en BBDD Service
curl http://localhost:3003/users/username/testuser
```

### Ver estadísticas
```bash
curl http://localhost:3003/stats
```

### Verificar health
```bash
curl http://localhost:3003/health/ready
```

## Monitorización

### Logs
Los logs incluyen:
- Operación ejecutada
- Duración del RPC
- Errores (si los hay)
- Auditoría de cambios

### Métricas
Disponibles en `/stats`:
- Total de usuarios
- Tokens revocados (activos)
- Operaciones en últimas 24h

## Debugging

### RabbitMQ
Instanta RabbiMQ Management en `http://rabbitmq:15672`
- Usuario: `guest`
- Contraseña: `guest`
- Ver colas: `bbdd.requests`, `gateway.reply`

### SQLite
```bash
sqlite3 bbdd.db
sqlite> SELECT * FROM Usuarios;
sqlite> SELECT COUNT(*) FROM Usuarios;
```

## Escalabilidad

- [ ] Migrar logs a tabla centralizada
- [ ] Implementar caché Redis para tokens
- [ ] Replicación de BD
- [ ] Sharding de datos por usuario
