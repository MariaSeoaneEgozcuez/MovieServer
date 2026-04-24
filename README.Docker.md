# MovieServer - Docker & Docker Swarm Deployment Guide

## Overview

MovieServer utiliza Docker y Docker Swarm para orquestar múltiples microservicios. Este documento proporciona instrucciones detalladas para desplegar y gestionar la aplicación en contenedores.

## Arquitectura de Microservicios

El sistema está compuesto por los siguientes servicios:

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `api-gateway` | 3000 | Puerta de entrada principal de la API REST |
| `auth-service` | - | Servicio de autenticación y autorización |
| `bbdd-service` | 3003 | Servicio de persistencia de datos (SQLite) |
| `stats-service` | 3005 | Servicio de estadísticas del sistema |
| `query-service` | - | Servicio de consultas RabbitMQ |
| `llm-service` | - | Servicio de recomendaciones con LLM |
| `telegram-service` | - | Bot de Telegram para interacciones |
| `rabbitmq` | 5672, 15672 | Message broker para comunicación asincrónica |

## Requisitos Previos

- Docker Desktop instalado y ejecutándose
- Docker Swarm inicializado: `docker swarm init`
- 2GB de RAM disponible mínimo
- Puertos 3000, 3003, 3005, 5672, 15672 disponibles

## Construcción de Imágenes

Todas las imágenes ya están construidas. Si necesitas reconstruir:

```sh
# Construir imágenes individuales
docker build -t api-gateway ./api-gateway
docker build -t auth-service ./auth-service
docker build -t bbdd-service ./BBDDMicroservicio
docker build -t stats-service ./StatsMicroservicio
docker build -t query-service ./QueryMicroservicio
docker build -t llm-service ./LlmMicroservicio
docker build -t telegram-service ./TelegramMicroservicio
```

## Despliegue con Docker Swarm

### Inicializar Swarm
```sh
docker swarm init
```

### Desplegar la aplicación
```sh
docker stack deploy -c docker-compose.yml movieserver
```

### Verificar estado del deployment
```sh
# Ver todos los servicios
docker service ls

# Ver tareas (contenedores) en ejecución
docker stack ps movieserver

# Ver logs de un servicio específico
docker service logs movieserver_api-gateway

# Ver logs de RabbitMQ
docker service logs movieserver_rabbitmq
```

### Actualizar la aplicación
```sh
# Después de hacer cambios y reconstruir imágenes
docker stack deploy -c docker-compose.yml movieserver
```

### Detener la aplicación
```sh
docker stack rm movieserver
```

## Gestión de Servicios

### Escalar un servicio
```sh
# Aumentar replicas de api-gateway a 3
docker service scale movieserver_api-gateway=3

# Ver replicas actuales
docker service ls
```

### Verificar logs de un servicio
```sh
# Últimos 50 líneas
docker service logs movieserver_api-gateway -n 50

# Modo follow (en tiempo real)
docker service logs movieserver_api-gateway -f
```

### Inspeccionar un servicio
```sh
docker service inspect movieserver_api-gateway
```

## Variables de Entorno

Las variables de entorno se definen en `docker-compose.yml`:

```yaml
environment:
  NODE_ENV: production
  RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
  TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}  # Configurable
  TELEGRAM_WELCOME_CHAT_ID: ${TELEGRAM_WELCOME_CHAT_ID}  # Configurable
```

### Configurar variables de entorno
```sh
# Antes de desplegar, exporta las variables
export TELEGRAM_BOT_TOKEN=your_token_here
export TELEGRAM_WELCOME_CHAT_ID=your_chat_id

# Luego despliega
docker stack deploy -c docker-compose.yml movieserver
```

## Acceso a Servicios

### API Gateway
```
http://localhost:3000
http://localhost:3000/api/docs  # Documentación Swagger
```

### BBDD Service
```
http://localhost:3003
```

### Stats Service
```
http://localhost:3005
```

### RabbitMQ Management
```
http://localhost:15672
Usuario: guest
Contraseña: guest
```

## Troubleshooting

### Los contenedores no inician

```sh
# Verificar logs
docker stack ps movieserver
docker service logs movieserver_<service_name>

# Reiniciar un servicio
docker service update --force movieserver_<service_name>
```

### RabbitMQ no responde

```sh
# Verificar conexión a RabbitMQ
docker exec $(docker ps -q -f label=com.docker.swarm.service.name=movieserver_rabbitmq) \
  rabbitmq-diagnostics -q ping

# Reiniciar RabbitMQ
docker service update --force movieserver_rabbitmq
```

### Problemas de conectividad entre servicios

```sh
# Verificar la red overlay
docker network ls
docker network inspect movieserver_movieserver-network

# Verificar si los servicios están en la misma red
docker service inspect movieserver_api-gateway | grep -A 5 NetworkSettings
```

## Monitoreo

### Ver uso de recursos
```sh
docker stats --all
```

### Ver eventos del Swarm
```sh
docker events --filter type=service
```

## Cleanup

### Limpiar recursos no utilizados
```sh
# Eliminar servicios detenidos
docker stack rm movieserver

# Limpiar imágenes no utilizadas
docker image prune

# Limpiar volúmenes no utilizados
docker volume prune

# Limpiar redes no utilizadas
docker network prune
```

## Referencias

- [Docker Swarm Documentation](https://docs.docker.com/engine/swarm/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Docker CLI Reference](https://docs.docker.com/engine/reference/commandline/cli/)
- [Node.js Docker Best Practices](https://docs.docker.com/language/nodejs/)