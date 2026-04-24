import { connect } from 'amqplib';

let connection = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const MAX_RETRIES = 10;
const INITIAL_DELAY = 2000;

async function connectWithRetries(url, maxRetries = MAX_RETRIES, delay = INITIAL_DELAY) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[RabbitMQ] Intento de conexión ${attempt}/${maxRetries}...`);
            const conn = await connect(url);
            console.log(`✓ RabbitMQ conectado en: ${url}`);
            return conn;
        } catch (error) {
            console.error(`✗ Intento ${attempt} falló:`, error.message);
            
            if (attempt < maxRetries) {
                const waitTime = delay * Math.pow(2, attempt - 1);
                console.log(`  Esperando ${waitTime}ms antes de reintentar...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                throw new Error(`No se pudo conectar a RabbitMQ después de ${maxRetries} intentos`);
            }
        }
    }
}

export async function connectRabbitMQ() {
    try {
        const rabbitmqUrl = RABBITMQ_URL;
        connection = await connectWithRetries(rabbitmqUrl);
        console.log('✓ Auth Service conectado a RabbitMQ');
        return connection.createChannel();
    } catch (error) {
        console.error('Error conectando a RabbitMQ:', error.message);
        throw error;
    }
}

export async function closeRabbitMQ() {
    if (connection) {
        await connection.close();
        console.log('Conexión a RabbitMQ cerrada');
    }
}
