import { connectRabbitMQ } from '/usr/src/app/shared/messaging/rabbitmq.js';

const REQUEST_QUEUE = 'llm.requests';
const RESPONSE_QUEUE = 'llm.responses';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'https://api.ollama.com';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-vl:235b';
const OLLAMA_KEY = process.env.OLLAMA_KEY;

const SYSTEM_MESSAGE = `Eres un recomendador experto de películas para una aplicación.

Tu tarea es analizar el prompt del usuario y generar recomendaciones de películas personalizadas.

Responde en formato claro y directo.`;

async function processPrompt(prompt) {
    if (!OLLAMA_KEY) {
        throw new Error('La variable de entorno OLLAMA_KEY no está definida. No se puede llamar a Ollama.');
    }

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OLLAMA_KEY}`
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_MESSAGE },
                { role: 'user', content: prompt }
            ],
            stream: false
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama returned ${response.status}: ${errorText}`);
    }

    const body = await response.json();
    return body?.message?.content || 'Ollama no devolvió contenido válido.';
}

export async function startLlmConsumer() {
    const channel = await connectRabbitMQ();

    await channel.assertQueue(REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

    channel.prefetch(1);

    console.log(`LLM Service esperando mensajes en ${REQUEST_QUEUE}...`);

    channel.consume(REQUEST_QUEUE, async (msg) => {
        if (!msg) return;

        try {
            const request = JSON.parse(msg.content.toString());
            console.log('[LLM] Mensaje recibido:', request);

            const prompt = request?.payload?.query || request?.payload?.prompt || '';
            const result = await processPrompt(prompt);

            const response = {
                messageId: request.messageId,
                timestamp: new Date().toISOString(),
                type: 'LLM_RESPONSE',
                correlationId: request.correlationId,
                payload: {
                    result
                }
            };

            const replyTo = msg.properties.replyTo || RESPONSE_QUEUE;

            channel.sendToQueue(
                replyTo,
                Buffer.from(JSON.stringify(response)),
                {
                    correlationId: request.correlationId,
                    persistent: true,
                    contentType: 'application/json'
                }
            );

            console.log(`[LLM] Respuesta enviada a ${replyTo} con correlationId ${request.correlationId}`);
            channel.ack(msg);
        } catch (error) {
            console.error('[LLM] Error procesando mensaje:', error.message);
            channel.nack(msg, false, false);
        }
    });
}