import { startAuthConsumer } from './consumer.js';

startAuthConsumer()
    .then(() => console.log('Auth Service iniciado correctamente'))
    .catch((error) => {
        console.error('Error iniciando Auth Service:', error);
        process.exit(1);
    });
