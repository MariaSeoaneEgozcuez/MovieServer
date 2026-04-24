import { connectRabbitMQ } from '../shared/messaging/rabbitmq.js';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const REQUEST_QUEUE = 'query.requests';
const RESPONSE_QUEUE = 'gateway.reply';
const LLM_QUEUE = 'llm.requests';

export async function startQueryConsumer() {
    const channel = await connectRabbitMQ();
    await channel.assertQueue(REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RESPONSE_QUEUE, { durable: true });
    await channel.assertQueue(LLM_QUEUE, { durable: true });
    channel.prefetch(1);

    console.log(`Query Service esperando mensajes en ${REQUEST_QUEUE}...`);

    channel.consume(REQUEST_QUEUE, async (msg) => {
        if (!msg) return;
        try {
            const request = JSON.parse(msg.content.toString());
            console.log('[QUERY] Mensaje recibido:', request);

            // Orquestar llamada al LLM
            const llmRequest = {
                messageId: uuidv4(),
                correlationId: request.correlationId,
                payload: {
                    query: request.payload.query
                }
            };

            // Enviar a LLM y esperar respuesta (RPC)
            const llmResponse = await sendLlmRpc(channel, llmRequest);

            // Preparar respuesta para el gateway
            const response = {
                messageId: request.messageId,
                timestamp: new Date().toISOString(),
                type: 'QUERY_RESPONSE',
                correlationId: request.correlationId,
                payload: {
                    result: llmResponse
                }
            };

            channel.sendToQueue(
                RESPONSE_QUEUE,
                Buffer.from(JSON.stringify(response)),
                {
                    correlationId: request.correlationId,
                    persistent: true,
                    contentType: 'application/json'
                }
            );
            channel.ack(msg);
            console.log(`[QUERY] Respuesta enviada a ${RESPONSE_QUEUE}`);
        } catch (error) {
            console.error('[QUERY] Error procesando mensaje:', error.message);
            channel.nack(msg, false, false);
        }
    });
}

// RPC a LLM
async function sendLlmRpc(channel, llmRequest) {
    return new Promise((resolve, reject) => {
        const replyQueue = 'query.llm.reply.' + llmRequest.correlationId;
        channel.assertQueue(replyQueue, { exclusive: true, autoDelete: true }).then(() => {
            channel.consume(replyQueue, (msg) => {
                if (!msg) return;
                const response = JSON.parse(msg.content.toString());
                resolve(response.payload.result);
                channel.deleteQueue(replyQueue);
            }, { noAck: true });

            channel.sendToQueue(
                LLM_QUEUE,
                Buffer.from(JSON.stringify(llmRequest)),
                {
                    correlationId: llmRequest.correlationId,
                    replyTo: replyQueue,
                    persistent: true,
                    contentType: 'application/json'
                }
            );
        }).catch(reject);
    });
}
