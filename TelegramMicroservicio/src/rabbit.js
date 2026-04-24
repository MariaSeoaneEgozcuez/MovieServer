import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

let connection = null;
let channel = null;
const pendingRequests = new Map();

const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
const REPLY_QUEUE = 'telegram.reply';

export async function initRabbitMQ() {
    try{
    if (channel) return channel;

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('Conectado a RabbitMQ en Telegram');

    connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err.message);
        connection = null;
        channel = null;
    });

    connection.on('close', () => {
        console.error('RabbitMQ connection closed');
        connection = null;
        channel = null;
    });

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

    console.log(`RabbitMQ listo en Telegram: ${RABBITMQ_URL}`);
    return channel;
    }
    catch(error){
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

export async function sendRequest(queue, data, timeout = 10000) {
    if (!channel) throw new Error('RabbitMQ no inicializado');

    const correlationId = uuidv4();

    return new Promise((resolve, reject) => {
        createRequestPromise(correlationId, timeout, resolve, reject);

        const message = {
            messageId: uuidv4(),
            timestamp: new Date().toISOString(),
            correlationId,
            payload: data
        };

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
    });
}

/**
 * Operaciones de alto nivel
 * Ajusta estas colas si finalmente cambias el diseño.
 */
export const sendAuthLogin = (data) =>
    sendRequest('auth.requests', { operation: 'auth.login', ...data });

export const sendAuthRegister = (data) =>
    sendRequest('auth.requests', { operation: 'auth.register', ...data });

export const sendRecommendation = (data) =>
    sendRequest('llm.requests', { query: data.query, token: data.token });

export const sendSystemStatus = () =>
    sendRequest('bbdd.requests', { operation: 'stats.system' });

export const sendSystemStats = () =>
    sendRequest('bbdd.requests', { operation: 'stats.system' });

export const sendAuthLogout = (data) =>
    sendRequest('auth.requests', { operation: 'auth.logout', ...data });