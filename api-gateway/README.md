# API Gateway - MovieServer Microservices

## Descripción

API Gateway central para la arquitectura de microservicios de MovieServer. Actúa como punto de entrada único y enruta las peticiones a los servicios correspondientes usando un modelo **híbrido**:

- **HTTP directo**: Para operaciones rápidas (Auth, Stats, BBDD)
- **RabbitMQ async**: Para operaciones lentas (Query, LLM)

## Arquitectura Híbrida

```
Cliente (REST)
    ↓ HTTP
[API Gateway] (puerto 3000)
    ├─ HTTP → Auth Service (3001)      [rápido: <1s]
    ├─ HTTP → BBDD Service (3003)      [rápido: <1s]
    ├─ HTTP → Stats Service (3006)     [rápido: <1s]
    └─ RabbitMQ → Query Service        [lento: puede tardar 30s+]
        └─ RabbitMQ → LLM Service      [muy lento: 60s+]
```

## Transporte de Datos

### Patrón Request/Reply (RPC) vía RabbitMQ
```
Gateway                    RabbitMQ           Query Service
  ├─ Envía mensaje con
  │  correlationId
  │          ──→ query.requests queue ──→
  │                                    Procesa...
  │                                    Responde
  │                ←─ gateway.reply queue ←──
  ├─ Recibe con
  │  correlationId
  └─ Resuelve promise
```

## Endpoints

### Autenticación (HTTP directo)
- `POST /auth/register` - Registrar usuario
- `POST /auth/login` - Iniciar sesión (obtener JWT)
- `GET /auth/verify` - Verificar token
- `POST /auth/logout` - Cerrar sesión

### Consultas (RabbitMQ asíncrono)
- `POST /api/query` - Enviar consulta (202 Accepted)
  - Retorna `queryId` para tracking
  - Procesa asíncronamente vía RabbitMQ
- `GET /api/query/status/:queryId` - Obtener estado de consulta

### Estadísticas (HTTP directo)
- `GET /api/stats` - Estadísticas del sistema
- `GET /api/stats/users/:userId` - Stats por usuario

### Sistema (HTTP directo)
- `GET /api/status` - Estado general
- `GET /api/telegram` - Prueba Telegram
- `GET /health` - Health check completo
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Métricas del proceso

### Documentación
- `GET /api/docs` - Swagger UI
- `GET /` - Root endpoint

## Instalación

```bash
npm install
```

## Configuración

Editar `config/default.json`:

```json
{
  "gateway": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "rabbitmq": {
    "url": "amqp://guest:guest@rabbitmq:5672"
  },
  "services": {
    "auth": {
      "url": "http://auth-service:3001",
      "timeout": 5000,
      "queue": "auth.requests"
    },
    "query": {
      "url": "http://query-service:3004",
      "timeout": 30000,
      "queue": "query.requests"
    }
    // ... más servicios
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
docker build -t api-gateway:latest .
docker run -p 3000:3000 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  api-gateway:latest
```

## Flujo de una Consulta Asíncrona

```
1. Cliente REST
   POST /api/query
   {
     "query": "Recomiéndame películas de acción"
   }

2. API Gateway
   - Valida JWT
   - Genera queryId (UUID)
   - Guarda progreso en memory/Redis
   - Envía a RabbitMQ sin esperar

3. Respuesta inmediata (202 Accepted)
   {
     "status": "accepted",
     "queryId": "abc-123",
     "statusUrl": "/api/query/status/abc-123"
   }

4. Cliente puede consultar
   GET /api/query/status/abc-123
   {
     "status": "processing",
     "startTime": 1234567890
   }

5. Cuando Query Service termina
   - Procesa la Query
   - Llama a LLM Service
   - Guarda resultado

6. Gateway actualiza en memoria
   {
     "status": "completed",
     "result": { ... },
     "duration": 25000
   }
```

## Health Checks

### Completo (`/health`)
```json
{
  "status": "healthy",
  "timestamp": "2026-04-17T...",
  "gateway": {
    "port": 3000,
    "uptime": 123.45
  },
  "messaging": {
    "status": "up",
    "url": "amqp://..."
  },
  "services": {
    "auth": { "status": "up", "transport": "http" },
    "query": { "status": "up", "transport": "rabbitmq" },
    "llm": { "status": "up", "transport": "rabbitmq" }
    // ...
  }
}
```

### Liveness (`/health/live`)
Solo verifica que el proceso está corriendo.

### Readiness (`/health/ready`)
Verifica que los servicios críticos están disponibles.

## Manejo de Errores

### Errores de validación
```json
{
  "error": "Falta el campo 'query'",
  "statusCode": 400,
  "timestamp": "2026-04-17T..."
}
```

### Errores de timeout
```json
{
  "error": "RPC timeout for queue query.requests after 30000ms",
  "statusCode": 500,
  "timestamp": "2026-04-17T..."
}
```

### Service unavailable
```json
{
  "error": "Service auth-service not responding",
  "statusCode": 503,
  "timestamp": "2026-04-17T..."
}
```

## Métricas

- `GET /metrics` retorna:
  - Uptime del proceso
  - Memoria (RSS, Heap)
  - Estado de cada servicio
  - Transporte utilizado

## Características

✅ **Routing dinámico**: HTTP vs RabbitMQ según servicio  
✅ **RPC Request/Reply**: Con correlationId y timeout  
✅ **Procesamiento asíncrono**: Queries sin bloqueo  
✅ **Health checks**: Múltiples niveles (live, ready, full)  
✅ **Swagger/OpenAPI**: Documentación automática  
✅ **JWT**: Autenticación con Bearer tokens  
✅ **CORS**: Soporte multi-origen  
✅ **Logging**: Structured logs con Pino  
✅ **Graceful shutdown**: SIGTERM/SIGINT handling  

## Monitorización

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Logs Correlacionados

Todos los logs en una request incluyen:
- `method`, `url`, `ip`
- `correlationId` (para RPC)
- `timestamp`
- `service` (destino)
- `transport` (HTTP/RabbitMQ)

## Troubleshooting

### "RabbitMQ connection refused"
- Verificar que RabbitMQ está corriendo
- Verificar configuración `RABBITMQ_URL`
- El Gateway intentará reconectar automáticamente

### "JWT verification failed"
- Token expirado (1 hora de validez)
- Generar nuevo token en `/auth/login`

### "RPC timeout"
- El servicio está lento o caído
- Aumentar timeout en configuración
- Verificar `/health` para diagnosticar

## Desarrollo

### Proyectos relacionados
- `services/auth-service` - Autenticación
- `services/query-service` - Orquestador
- `services/llm-service` - LLM
- `services/bbdd-service` - Base de datos
- `services/stats-service` - Estadísticas
- `TelegramMicroservicio` - Bot Telegram

### Testing local
```bash
# Terminal 1: Gateway
npm start

# Terminal 2: Curl test
curl -X POST http://localhost:3000/api/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "películas de acción"}'
```

## Licencia

UNLICENSE - Proyecto académico
