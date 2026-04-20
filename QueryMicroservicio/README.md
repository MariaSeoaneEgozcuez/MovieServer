# Query Microservicio

Este microservicio recibe consultas de películas desde la cola `query.requests`, orquesta la llamada al LLM (Ollama) a través de la cola `llm.requests` y responde al gateway por la cola `gateway.reply`.

## Estructura
- index.js: arranque del servicio
- src/consumer.js: lógica de consumo y orquestación

## Variables de entorno necesarias
- RabbitMQ URL (por defecto: amqp://guest:guest@rabbitmq:5672)

## Uso

```bash
npm install
npm start
```
