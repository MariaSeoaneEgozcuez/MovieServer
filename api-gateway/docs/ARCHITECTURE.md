# API Gateway - Arquitectura y Patrones

## Visión General

El API Gateway es el **punto de entrada único** para todos los clientes en la arquitectura de microservicios de MovieServer. Implementa un modelo **híbrido** que combina:

1. **HTTP/REST directo** para operaciones síncronas rápidas
2. **RabbitMQ Request/Reply** para operaciones asincrónicas largas

## Decisión de Diseño: ¿Por qué Híbrido?

### Problema
- Algunos servicios responden en <1s (Auth, BBDD)
- Otros tardan >30s (LLM, Query que requiere LLM)
- No podemos tener clientes esperando 30+ segundos bloqueados

### Solución Híbrida

```
Operaciones Rápidas (< 5s)        Operaciones Lentas (> 5s)
    ↓                                  ↓
[HTTP Directo]                   [RabbitMQ Async + Polling]
  Auth Service                     Query Service
  BBDD Service                     LLM Service
  Stats Service                    
```

### Ventajas
✅ Simplicidad: Servicios rápidos sin overhead RabbitMQ  
✅ Latencia baja: HTTP es más rápido que AMQP  
✅ Escalabilidad: RabbitMQ maneja carga en operaciones lentas  
✅ Resiliencia: Desacoplamiento en operaciones críticas  

## Arquitectura Detallada

```
┌─────────────────────────────────────────────────────┐
│                CLIENT (REST)                        │
│   Telegram Bot / Web / Mobile / Postman            │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/1.1
                     ↓
        ┌────────────────────────────┐
        │  API GATEWAY (puerto 3000) │
        │                            │
        │  ├─ Routing                │
        │  ├─ Auth (JWT)             │
        │  ├─ Load balancing         │
        │  ├─ Error handling         │
        │  ├─ Request logging        │
        │  └─ Health checks          │
        └────┬─────────────────────┬─┘
             │                     │
    HTTP (sync)                RabbitMQ (async)
             │                     │
    ┌────────┴──────┐         ┌────┴──────────┐
    │                │        │               │
    ↓                ↓        ↓               ↓
[AUTH-SVC]  [BBDD-SVC]   [QUERY-SVC]   [LLM-SVC]
(3001)      (3003)       (3004)        (3002)
```

## Patrones de Comunicación Implementados

### 1. Request/Reply (RPC via AMQP)

**Usado por**: Query Service, LLM Service  
**Características**: Asíncrono, timeout configurable, correlationId

#### Flujo
```
Gateway                          RabbitMQ               Service
  │
  ├─ Genera correlationId
  │  { messageId, timestamp,
  │    correlationId, payload }
  │
  └──→ query.requests ────────→
                                (consume, procesa)
                                  │
                              (genera respuesta)
                              { resultado }
                              │
         ←─────── gateway.reply ←
         (con mismo correlationId)
  │
  ├─ Busca pending[correlationId]
  ├─ Resuelve promise
  └─ Retorna al cliente
```

**Código**:
```javascript
// Enviar RPC request
const response = await queryService.post('/query/process', {
  query: 'recommendation request',
  userId: 123
});
```

**Ventajas**:
- No bloqueado (async)
- Tolerante a fallos (timeout)
- Desacoplado (via queue)

### 2. Request/Response (HTTP directo)

**Usado por**: Auth Service, BBDD Service, Stats Service  
**Características**: Síncrono, TCP directo, rápido

#### Flujo
```
Gateway                          Network              Service
  │
  ├─ POST /auth/login
  │  { username, password }
  │
  └──→ TCP connection ──────────────────→ localhost:3001
                                         (procesa inmediatamente)
                                         │
                           ←────────────── {"token": "..."}
  │
  ├─ Parsea respuesta
  └─ Retorna al cliente
```

**Código**:
```javascript
// Enviar HTTP request
const response = await authService.post('/auth/login', {
  username: 'user',
  password: 'pass'
});
```

**Ventajas**:
- Latencia mínima (<100ms)
- Simple de debuggear (TCP visible)
- No requiere message broker

### 3. Async Processing (202 Accepted)

**Usado por**: POST /api/query  
**Patrón**: Client obtiene ID, consulta estado, polling

#### Flujo
```
Client                Gateway              RabbitMQ           Service
  │
  ├─ POST /api/query
  │
  └──→ Genera queryId
       Guarda en progreso
       Envía a RabbitMQ
       Retorna 202
       │
       ├─ { queryId, statusUrl }
       │
       └──→ RESPONDE INMEDIATAMENTE (no espera)
            │
            ├─ Cliente recibe queryId
            │
            └──→ GET /api/query/status/abc-123
                 ├─ ¿processing?
                 ├─ ¿completed?
                 └─ ¿failed?
                    (polling cada segundo)
```

**Ventajas**:
- Cliente no bloqueado
- Predicible (no hay timeout)
- Cliente puede hacer otras cosas

## Implementación de Servicios

### ServiceClient Híbrido

```javascript
class ServiceClient {
  constructor(serviceName, transport = 'http') {
    this.serviceName = serviceName;
    this.transport = transport;
    // HTTP para servicios rápidos
    // RabbitMQ para servicios lentos
  }

  async post(endpoint, data) {
    if (this.transport === 'http') {
      return this._postHttp(endpoint, data);
    } else {
      return this._postRabbitMQ(endpoint, data);
    }
  }
}

// Instancias predefinidas
export const authService = createServiceClient('auth', 'http');     // Rápido
export const queryService = createServiceClient('query', 'rabbitmq'); // Lento
```

### RabbitMQ Client

```javascript
export async function sendRPCRequest(queue, payload, timeout) {
  const ch = await connectRabbitMQ();
  const correlationId = uuidv4();

  return new Promise((resolve, reject) => {
    // Timeout
    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, timeout);

    // Guardar pending
    pendingRequests.set(correlationId, {
      resolve: (data) => {
        clearTimeout(timer);
        resolve(data);
      }
    });

    // Publicar mensaje
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      correlationId,
      replyTo: 'gateway.reply'
    });
  });
}
```

## Health Checks

### Niveles de Health

#### 1. Liveness (`/health/live`)
```json
{
  "status": "alive"
}
```
- ¿Está el proceso corriendo?
- Respuesta: SIEMPRE OK (mientras esté arriba)
- Usado por: Kubernetes para restart si falla

#### 2. Readiness (`/health/ready`)
```json
{
  "status": "ready"
}
```
- ¿Puede recibir tráfico?
- Verifica: Servicios críticos (auth, bbdd)
- Respuesta: 503 si alguno está caído
- Usado por: Kubernetes para load balancing

#### 3. Full (`/health`)
```json
{
  "status": "healthy",
  "gateway": { "uptime": 123.45 },
  "messaging": { "status": "up" },
  "services": {
    "auth": { "status": "up", "transport": "http" },
    "query": { "status": "up", "transport": "rabbitmq" }
  }
}
```
- Mostrar TODO el sistema
- Mostrar qué transporte usa cada servicio
- Mostrar si están degradados

## Configuración de Timeouts

```json
{
  "services": {
    "auth": {
      "timeout": 5000      // 5 segundos (rápido)
    },
    "query": {
      "timeout": 30000     // 30 segundos (puede esperar)
    },
    "llm": {
      "timeout": 60000     // 60 segundos (muy lento)
    }
  }
}
```

## Manejo de Errores Distribuidos

### Escenario 1: Servicio HTTP caído
```
Gateway → Auth Service (muerto)
          └─ ECONNREFUSED

Respuesta al cliente:
{
  "error": "Connection refused",
  "statusCode": 503,
  "service": "auth",
  "transport": "http"
}
```

### Escenario 2: RPC timeout
```
Gateway → RabbitMQ → Query Service (muy lento)
          (esperando 30s...)
          └─ TIMEOUT

Respuesta al cliente:
{
  "error": "RPC timeout for queue query.requests after 30000ms",
  "statusCode": 500,
  "service": "query",
  "transport": "rabbitmq"
}
```

### Escenario 3: RabbitMQ caído
```
Gateway → RabbitMQ (muerto)
          └─ Connection refused

Respuesta al cliente:
{
  "error": "RabbitMQ not available",
  "statusCode": 503,
  "messaging": "down"
}
```

## Observabilidad

### Logging Correlacionado

Cada request tiene:
```
{
  "timestamp": "2026-04-17T10:30:45.123Z",
  "level": "info",
  "method": "POST",
  "url": "/api/query",
  "ip": "192.168.1.100",
  "userId": 123,
  "correlationId": "abc-123-def-456",
  "service": "query",
  "transport": "rabbitmq",
  "duration": 5230,
  "status": 202
}
```

### Métricas Básicas

```
GET /metrics
{
  "process": {
    "uptime": 3600,
    "memory": {
      "rss": "45 MB",
      "heapUsed": "28 MB"
    }
  },
  "services": {
    "auth": { "status": "up" },
    "query": { "status": "up" },
    ...
  }
}
```

## Escalabilidad

### Horizontalmente (múltiples Gateways)

```
┌────────────────────────────────────────┐
│         Load Balancer (Nginx)          │
├────────────────────────────────────────┤
│  Gateway 1 │  Gateway 2 │  Gateway 3   │
└────────────┴────────────┴──────────────┘
             │
      RabbitMQ + Services
```

Cada Gateway es stateless excepto por el tracking de queries en memoria (migrar a Redis para multi-instancia).

### Verticalmente (más capacidad)

- Aumentar `replicas` en Kubernetes
- Aumentar recursos CPU/RAM
- Aumentar workers de RabbitMQ

## Seguridad

### JWT en Authorization Header
```
Authorization: Bearer eyJhbGc...
```

### Validación en cada petición protegida

```javascript
fastify.post('/api/query', {
  preHandler: authenticateToken  // ← Validar JWT
}, ...);
```

### CORS habilitado
```javascript
await fastify.register(fastifyCors, {
  origin: true,  // Permitir todos los orígenes
  credentials: true
});
```

## Testing

### Curl local
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}' | jq -r '.token')

# Query
curl -X POST http://localhost:3000/api/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"películas"}'

# Status
curl http://localhost:3000/health
```

## Evolución Futura

- [ ] Circuit breaker si servicio tarda mucho
- [ ] Retry logic con backoff exponencial
- [ ] Redis para tracking de queries (multi-instancia)
- [ ] Rate limiting por usuario
- [ ] Caching de respuestas frecuentes
- [ ] Distributed tracing (Jaeger)
- [ ] Metrics Prometheus

## Referencias

- RabbitMQ AMQP: https://www.rabbitmq.com/
- Fastify: https://www.fastify.io/
- JWT: https://jwt.io/
