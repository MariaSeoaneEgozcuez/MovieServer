# MovieServer

## Descripción del sistema y temática elegida
MovieServer es un sistema de recomendación de películas que permite a los usuarios obtener sugerencias personalizadas a través de un chatbot de Telegram y una API REST. El sistema utiliza autenticación JWT, una base de datos SQLite y un modelo LLM externo (Ollama) para generar recomendaciones inteligentes.

## Arquitectura y servicios integrados

- **Backend:** Node.js + Fastify
- **Base de datos:** SQLite
- **Autenticación:** JWT (login + register + logout + verify)
- **Recomendaciones:** LLM externo (Ollama)
- **Bot:** Telegram (Telegraf)
- **Documentación:** Swagger/OpenAPI en `/api/docs`

## Instrucciones de instalación y configuración

1. **Clona el repositorio:**
   ```sh
   git clone https://github.com/MariaSeoaneEgozcuez/MovieServer.git
   cd MovieServer
   ```
2. **Instala las dependencias:**
   ```sh
   npm install
   ```
3. **Configura las variables de entorno:**
   - Edita `config/local.json` para añadir tus claves:
     - `telegram.botToken`: Token de tu bot de Telegram
     - `jwt.secret`: Secreto para JWT
     - `ollama.key`: API Key de Ollama
   - Opcionalmente, ajusta el puerto y la ruta de la base de datos en `config/default.json`.
4. **Inicia el servidor:**
   ```sh
   npm start
   ```
5. **(Opcional) Inicia el bot de Telegram:**
   ```sh
   node src/controllers/telegram/bot.js
   ```

## Variables de entorno necesarias

- `telegram.botToken`: Token del bot de Telegram
- `jwt.secret`: Secreto para firmar JWT
- `ollama.key`: API Key para el modelo LLM
- `server.port`: Puerto del servidor (por defecto 3000)
- `db.filename`: Ruta del archivo SQLite (por defecto `./bbdd.db`)

## Documentación de la API REST propia

La documentación interactiva está disponible en: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

### Endpoints principales

#### Registro de usuario
- **POST** `/api/auth/register`
  - Body: `{ "username": "usuario123", "email": "usuario@email.com", "password": "contraseñaSegura123" }`
  - Respuesta: `{ "message": "Usuario creado exitosamente" }`

#### Login
- **POST** `/api/auth/login`
  - Body: `{ "username": "usuario123", "password": "contraseñaSegura123" }`
  - Respuesta: `{ "token": "<JWT>", "user": { ... } }`

#### Verificar token
- **GET** `/api/auth/verify` (requiere JWT)
  - Respuesta: `{ "valid": true, "user": { ... } }`

#### Logout
- **POST** `/api/auth/logout` (requiere JWT)
  - Respuesta: `{ "message": "Sesión cerrada" }`

#### Obtener recomendaciones
- **POST** `/api/query` (requiere JWT)
  - Body: `{ "query": "Me gustan las películas de acción y ciencia ficción" }`
  - Respuesta: `{ "success": true, "data": "{ 'recommendations': [ ... ] }" }`

#### Estadísticas del sistema
- **GET** `/api/stats`
  - Respuesta: `{ "status": "success", "stats": { "total_users": 10, "revoked_tokens": 2 } }`

#### Estado del servidor
- **GET** `/api/status`
  - Respuesta: `{ "status": "ok", "message": "El servidor funciona correctamente." }`

#### Prueba de integración Telegram
- **GET** `/api/telegram`
  - Respuesta: `{ "status": "success", "message": "¡Bienvenido a la API de Telegram!" }`

## Ejemplos de uso

### Registro y login
```sh
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "username": "usuario123", "email": "usuario@email.com", "password": "contraseñaSegura123" }'

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "username": "usuario123", "password": "contraseñaSegura123" }'
```

### Obtener recomendaciones
```sh
curl -X POST http://localhost:3000/api/query \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Me gustan las películas de acción y ciencia ficción" }'
```

### Consultar estadísticas
```sh
curl http://localhost:3000/api/stats
```

### Usar el bot de Telegram
- Busca tu bot en Telegram y usa `/register`, `/login` o envía un mensaje para pedir recomendaciones.

---

Para más detalles, consulta la documentación Swagger en `/api/docs` o revisa el código fuente.
