import {connect} from 'amqplib';

let channel;

// Función para crear la conexión y el canal de RabbitMQ
async function createChannel() {
    const connection = await connect(process.env.RABBIT_URL); // Se conecta a RabbitMQ usando la URL del entorno
    channel = await connection.createChannel();

    // Se aseguran las colas necesarias para enviar y recibir mensajes
    await channel.assertQueue("recommendation.request");
    await channel.assertQueue("recommendation.response"); 

    console.log("Conectado a RabbitMQ");
}

// Función para enviar mensajes a la cola de RMQ
async function sendToQueue(data) {
    data = JSON.stringify(data); // Se mandan siempre en JSON
    const buffer = Buffer.from(data); // Se convierte a buffer para enviar por RabbitMQ
    channel.sendToQueue("recommendation.request", buffer); // Hay que asegurarse del nombre de la cola

    console.log("Mensaje enviado a RabbitMQ:", data);
}

async function consumeFromQueue(callback) {

    channel.consume("recommendation.response", (msg) => {

        if (!msg) return; // Por si es null que no se ralle

        const text = msg.content.toString();
        const data = JSON.parse(text); // Se parsea el mensaje recibido
        console.log("Mensaje recibido de RabbitMQ:", data);
        callback(data); // Se llama al callback con los datos recibidos

        channel.ack(msg);
    });

}