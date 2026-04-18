import { startLlmConsumer } from './consumer.js';

async function bootstrap() {
    try {
        await startLlmConsumer();
        console.log('LLM Service iniciado correctamente');
    } catch (error) {
        console.error('Error iniciando LLM Service:', error);
        process.exit(1);
    }
}

bootstrap();