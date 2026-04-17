import amqp from 'amqplib';

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

export async function connectRabbitMQ() {
    if (channel) {
        return channel;
    }

    connection = await amqp.connect(RABBITMQ_URL);

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

    channel = await connection.createChannel();

    return channel;
}

export async function closeRabbitMQ() {
    try {
        if (channel) {
            await channel.close();
        }
        if (connection) {
            await connection.close();
        }
    } finally {
        channel = null;
        connection = null;
    }
}