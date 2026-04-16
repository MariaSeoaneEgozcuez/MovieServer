import { connect } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

let channel;
const pendingRequests = new Map();

const exchange = 'microservices';
const responseQueue = 'telegram.response';

export async function initRabbitMQ() {
    const connection = await connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    // Crear el exchange común
    await channel.assertExchange(exchange, 'direct', { durable: true });

    // Crear la cola donde llegan las respuestas
    await channel.assertQueue(responseQueue, { durable: true });

    // Binding para unir todo
    await channel.bindQueue(
        responseQueue, 
        exchange, 
        responseQueue // Pattern o routingKey, es el tag que se usa para que venga a la cola de telegram
    );

    channel.consume(responseQueue, (msg) => {
        if (!msg) return;

        const correlationId = msg.properties.correlationId;
        const pending = pendingRequests.get(correlationId);

        if (pending) {
            try{
                const data = JSON.parse(msg.content.toString()); // transformar el json en un string
                pending.resolve(data); // resolver con el mensaje de respuesta
            } catch (error) {
                pending.reject(error); // si hay error, reject it
            } finally {
                pendingRequests.delete(correlationId); // eliminar el id de una forma u otra
            }
        }

        channel.ack(msg);
        
    });

    console.log('RabbitMQ listo')

}
// Promise
function createRequestPromise(correlationId, timeout, resolve, reject){

    // Crear el timeout y si se acaba eliminar el correlationId y dar un error de Timeout
    const timer = setTimeout(() => {
        pendingRequests.delete(correlationId);
        reject(new Error('Timeout'));
    }, timeout);

    // Si llega notificación de llegada, metemos la info en el Map de pendigRequests
    pendingRequests.set(correlationId, {

        // Si hay datos que añadir, se borra el timeout y se resuelve
        resolve : (data) => {
            clearTimeout(timer);
            resolve(data);
        },

        // Si hay errores, re hace un reject sin olvidar borrar el timer
        reject : (error) => {
            clearTimeout(timer);
            reject(error);
        }
    });
}


export async function sendRequest(routingKey, data, timeout = 10000){
    if (!channel) throw new Error('RabbitMQ no inicializado');

    const correlationId = uuidv4(); // Crear un id único para cada petición
    const message = JSON.stringify(data); 

    // Devolver una promesa que se resolverá cuando llegue la respuesta o se alcance el timeout
    return new Promise((resolve, reject) => {   
        createRequestPromise(correlationId, timeout, resolve, reject);

        // Publicar el mensaje en el exchange con la routingKey y las propiedades necesarias
        channel.publish(
            exchange,
            routingKey,
            Buffer.from(message),
            {
                correlationId,
                replyTo: responseQueue
            }
        );

        console.log(`Enviado: ${routingKey}`, data);
    });
}

// Funciones específicas para cada tipo de petición, que simplemente llaman a sendRequest con el routingKey adecuado
export const sendAuthLogin = (data) =>
    sendRequest('auth.login', data);

export const sendAuthRegister = (data) =>
    sendRequest('auth.register', data);

export const sendRecommendation = (data) =>
    sendRequest('recommendation.get', data);

export const sendSystemStatus = (data) =>
    sendRequest('system.status', data);