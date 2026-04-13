import {connect} from 'amqplib';
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
            const text = msg.content.toString();
            const data = JSON.parse(text);
            pending.resolve(data); // Se resuelve la promesa con los datos recibidos
            pendingRequests.delete(correlationId); // Se elimina el mensaje pendiente
        }
        channel.ack(msg); // Acknowledge del mensaje
    });


    console.log("Conectado a RabbitMQ");
}

// Función para enviar mensajes a la cola de RMQ
async function sendToQueueRecommendation(data, timeout = 10000) {
    // Ver si el canal está inicializado, si no, lanzar un error
    if (!channel) throw new Error("Channel not initialized"); 

    const correlationId = uuidv4(); // Generar ID único para el mensaje
    const message = JSON.stringify(data); // Se mandan siempre en JSON

    return new Promise((resolve, reject) => {
        // En caso de que termine el timeout, se rechaza con un error (control)
        const timer = setTimeout(() => {
            pendingRequests.delete(correlationId); // Se elimina el mensaje pendiente si se agota el tiempo
            reject(new Error("Timeout waiting for response")); // Se rechaza la promesa por timeout
        }, timeout);

        pendingRequests.set(correlationId, { // Añadir la promesa en "pendientes"
            // En caso de éxito, se limpia el timeout y se resuelve la promesa con la respuesta recibida
            resolve: (response) => {
                clearTimeout(timer);
                resolve(response);
            },
            
            // En caso de error, se limpia el timeout y se rechaza la promesa
            reject: (error) => {
                clearTimeout(timer);
                reject(error);
            }

        });

        channel.sendToQueue("recommendation.request", Buffer.from(message), { 
            correlationId: correlationId,
            replyTo: "telegram.response"
        });

        console.log("Mensaje enviado a RabbitMQ:", message, "con correlationId:", correlationId);
    });
}


async function sendToQueueAuth(queue, data, timeout = 10000) {
    if (!channel) throw new Error("Channel not initialized");

    const correlationID = uuidv4();
    const message = JSON.stringify(data);

    return new Promise((resolve, reject) => {
        const timer = set.timeout(() => {
            pendingRequests.delete(correlationID);
            reject(new Error("Timeout waiting for response"));          
        }, timeout);

        pendingRequests.set(correlationID,{
            resolve: (response) => {
                clearTimeout(timer);
                resolve(response);                
            },

            reject: (error) => {
                clearTimeout(timer);
                reject(error);
            }
        })

        channel.sendToQueue("auth.login.request", Buffer.from(message), {
            correlationId: correlationID,
            replyTo: "telegram.response"
        });

        console.log("Mensaje enviado a RabbitMQ:", message, "con correlationId:", correlationID);
    });
}

// Exportar las funciones necesarias
export { createChannel, sendToQueueRecommendation, sendToQueueAuth };