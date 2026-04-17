import { connectRabbitMQ } from '../../shared/messaging/rabbitmq.js';

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

    console.log('LLM Service esperando mensajes en llm.requests...');

    channel.consume(REQUEST_QUEUE, async (msg) => {
        if (!msg) return;

        try {
            const request = JSON.parse(msg.content.toString());
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

            channel.sendToQueue(
                RESPONSE_QUEUE,
                Buffer.from(JSON.stringify(response)),
                {
                    correlationId: request.correlationId,
                    persistent: true
                }
            );

            channel.ack(msg);
        } catch (error) {
            console.error('Error procesando mensaje LLM:', error.message);
            channel.nack(msg, false, false);
        }
    });
}