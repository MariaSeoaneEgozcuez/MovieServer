import { startQueryConsumer } from './src/consumer.js';

async function bootstrap() {
    try {
        await startQueryConsumer();
        console.log('Query Service iniciado correctamente');
    } catch (error) {
        console.error('Error iniciando Query Service:', error);
        process.exit(1);
    }
}

bootstrap();
