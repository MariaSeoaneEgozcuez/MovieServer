import amqp from 'amqplib';

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MAX_RETRIES = 20;
const INITIAL_DELAY = 5000; // 5 segundos

async function connectWithRetries(url, maxRetries = MAX_RETRIES, delay = INITIAL_DELAY) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[RabbitMQ] Intento de conexión ${attempt}/${maxRetries}...`);
            const conn = await amqp.connect(url);
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
    if (channel) return channel;

    connection = await connectWithRetries(RABBITMQ_URL);

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
    console.log('✓ Canal de RabbitMQ creado exitosamente');

    return channel;
}