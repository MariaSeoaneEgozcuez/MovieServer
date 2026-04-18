import { connectRabbitMQ } from '../shared/messaging/rabbitmq.js';

const REQUEST_QUEUE = 'llm.requests';
const RESPONSE_QUEUE = 'llm.responses';

async function processPrompt(prompt) {
    return `Respuesta simulada del LLM para: ${prompt}`;
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