import { connectRabbitMQ } from '../shared/messaging/rabbitmq.js';
import { v4 as uuidv4 } from 'uuid';

let channel = null;
const pendingRequests = new Map();

const REPLY_QUEUE = 'telegram.reply';

export async function initRabbitMQ() {
    if (channel) return channel;

    try {
        channel = await connectRabbitMQ();
        console.log('Conectado a RabbitMQ en Telegram');

        await channel.assertQueue(REPLY_QUEUE, { durable: true });

        await channel.consume(
            REPLY_QUEUE,
            (msg) => {
                if (!msg) return;

                const correlationId = msg.properties.correlationId;
                const pending = pendingRequests.get(correlationId);

                if (pending) {
                    try {
                        const data = JSON.parse(msg.content.toString());
                        pending.resolve(data);
                    } catch (error) {
                        pending.reject(error);
                    } finally {
                        pendingRequests.delete(correlationId);
                    }
                }

                channel.ack(msg);
            },
            { noAck: false }
        );

        console.log(`RabbitMQ listo en Telegram`);
        return channel;
    } catch (error) {
        console.error('Error al conectar a RabbitMQ:', error.message);
        throw error;
    }
}

function createRequestPromise(correlationId, timeout, resolve, reject) {
    const timer = setTimeout(() => {
        pendingRequests.delete(correlationId);
        reject(new Error('Timeout'));
    }, timeout);

    pendingRequests.set(correlationId, {
        resolve: (data) => {
            clearTimeout(timer);
            resolve(data);
        },
        reject: (error) => {
            clearTimeout(timer);
            reject(error);
        }
    });
}

export async function sendRequest(queue, data, timeout = 10000, retryAttempt = 0) {
    if (!channel) {
        // Si el canal está desconectado, intentar reinicializar
        if (retryAttempt < 3) {
            console.warn(`[Telegram RPC] Canal desconectado, reintentando (${retryAttempt + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryAttempt + 1)));
            try {
                await initRabbitMQ();
                return sendRequest(queue, data, timeout, retryAttempt + 1);
            } catch (error) {
                if (retryAttempt < 2) {
                    return sendRequest(queue, data, timeout, retryAttempt + 1);
                }
            }
        }
        throw new Error('RabbitMQ no inicializado. Intenta de nuevo en unos segundos.');
    }

    const correlationId = uuidv4();

    return new Promise((resolve, reject) => {
        createRequestPromise(correlationId, timeout, resolve, reject);

        const message = {
            messageId: uuidv4(),
            timestamp: new Date().toISOString(),
            correlationId,
            payload: data
        };

        try {
            channel.sendToQueue(
                queue,
                Buffer.from(JSON.stringify(message)),
                {
                    correlationId,
                    replyTo: REPLY_QUEUE,
                    persistent: true,
                    contentType: 'application/json'
                }
            );

            console.log(`[Telegram RPC] Enviado a ${queue} con correlationId ${correlationId}`);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Operaciones de alto nivel
 * Ajusta estas colas si finalmente cambias el diseño.
 */
export const sendAuthLogin = (data) =>
    sendRequest('auth.requests', { operation: 'auth.login', username: data.username, password: data.password }, 20000);

export const sendAuthRegister = (data) =>
    sendRequest('auth.requests', { operation: 'auth.register', username: data.username, email: data.email, password: data.password }, 20000);

export const sendRecommendation = (data) =>
    sendRequest('llm.requests', { query: data.query, token: data.token }, 30000);

export const sendSystemStatus = () =>
    sendRequest('bbdd.requests', { payload: { operation: 'stats.system' } }, 15000);

export const sendSystemStats = () =>
    sendRequest('bbdd.requests', { payload: { operation: 'stats.system' } }, 15000);

export const sendAuthLogout = (data) =>
    sendRequest('auth.requests', { operation: 'auth.logout', token: data.token }, 15000);