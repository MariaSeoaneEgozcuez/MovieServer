import { randomUUID } from 'crypto';
import { connectRabbitMQ } from './rabbitmq.js';

const REQUEST_QUEUE = 'llm.requests';
const RESPONSE_QUEUE = 'llm.responses';

export async function sendLlmRequest(payload, timeoutMs = 30000) {
    const channel = await connectRabbitMQ();

    await channel.assertQueue(REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

    const correlationId = randomUUID();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout esperando respuesta del LLM'));
        }, timeoutMs);

        channel.consume(
            RESPONSE_QUEUE,
            (msg) => {
                if (!msg) return;

                if (msg.properties.correlationId === correlationId) {
                    clearTimeout(timer);

                    try {
                        const content = JSON.parse(msg.content.toString());
                        resolve(content);
                    } catch (error) {
                        reject(error);
                    } finally {
                        channel.ack(msg);
                    }
                }
            },
            { noAck: false }
        ).then(() => {
            const message = {
                messageId: randomUUID(),
                timestamp: new Date().toISOString(),
                type: 'LLM_REQUEST',
                correlationId,
                payload
            };

            channel.sendToQueue(
                REQUEST_QUEUE,
                Buffer.from(JSON.stringify(message)),
                {
                    correlationId,
                    persistent: true
                }
            );
        }).catch(reject);
    });
}