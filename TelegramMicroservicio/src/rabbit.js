import { connect } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

let channel;
const pendingRequests = new Map(); // Mapa para almacenar las promesas pendientes

// Función para crear la conexión y el canal de RabbitMQ
async function createChannel() {
    const connection = await connect(process.env.RABBIT_URL); // Se conecta a RabbitMQ usando la URL del entorno
    channel = await connection.createChannel();

    // Se aseguran las colas necesarias para enviar y recibir mensajes
    await channel.assertQueue("recommendation.request");

    // Se aseguran las colas para la autentificación
    await channel.assertQueue("auth.login.request");
    await channel.assertQueue("auth.register.request");

    // Se aseguran las colas para el estado del sistema
    await channel.assertQueue("systemStatus.request");

    // Hacer una unica cola para el consume
    await channel.assertQueue("telegram.response");

    await channel.consume("telegram.response", (msg) => {
        if (!msg) return; // Si no hay nada, no se hace nada
        const correlationId = msg.properties.correlationId; // Se obtiene el id para saber a qué está respondiendo
        const pending = pendingRequests.get(correlationId); // Se busca el mensaje pendiente con ese id
        if (pending) {
            try {
                const text = msg.content.toString();
                const data = JSON.parse(text);
                pending.resolve(data);
            } catch (error) {
                pending.reject(error);
            } finally {
                pendingRequests.delete(correlationId);
            }
        }
        channel.ack(msg); // Acknowledge del mensaje
    });

    console.log('Conectado a RabbitMQ');
}

// Función promesa, se usa en todas las funciones Send, menos codigo
function createRequestPromise(correlationId, timeout, resolve, reject) {
    const timer = setTimeout(() => {
        pendingRequests.delete(correlationId);
        reject(new Error('Timeout waiting for response'));
    }, timeout);

    pendingRequests.set(correlationId, {
        resolve: (response) => {
            clearTimeout(timer);
            resolve(response);
        },
        reject: (error) => {
            clearTimeout(timer);
            reject(error);
        }
    });
}

async function sendToQueue(queue, data, timeout = 10000) {
    if (!channel) throw new Error('Channel not initialized');

    const correlationId = uuidv4();
    const message = JSON.stringify(data);

    return new Promise((resolve, reject) => {
        createRequestPromise(correlationId, timeout, resolve, reject);

        channel.sendToQueue(queue, Buffer.from(message), {
            correlationId,
            replyTo: 'telegram.response'
        });

        console.log('Mensaje enviado a RabbitMQ:', message, 'con correlationId:', correlationId, 'a cola:', queue);
    });
}

async function sendToQueueRecommendation(data, timeout = 10000) {
    return sendToQueue('recommendation.request', data, timeout);
}

async function sendToQueueAuth(queue, data, timeout = 10000) {
    if (queue !== 'auth.login.request' && queue !== 'auth.register.request') {
        throw new Error('Invalid auth queue');
    }
    return sendToQueue(queue, data, timeout);
}

async function sendToQueueSystem(data, timeout = 10000) {
    return sendToQueue('systemStatus.request', data, timeout);
}

export {
    createChannel,
    sendToQueue,
    sendToQueueRecommendation,
    sendToQueueAuth,
    sendToQueueSystem
};