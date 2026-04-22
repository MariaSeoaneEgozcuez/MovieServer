import { connect } from 'amqplib';

let connection = null;

export async function connectRabbitMQ() {
    try {
        const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
        connection = await connect(rabbitmqUrl);
        console.log('Conectado a RabbitMQ');
        return connection.createChannel();
    } catch (error) {
        console.error('Error conectando a RabbitMQ:', error);
        throw error;
    }
}

export async function closeRabbitMQ() {
    if (connection) {
        await connection.close();
        console.log('Conexión a RabbitMQ cerrada');
    }
}
