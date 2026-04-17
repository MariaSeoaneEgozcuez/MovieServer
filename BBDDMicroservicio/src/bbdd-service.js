import Fastify from 'fastify';
import config from 'config';

import { connectDB, closeDB, checkDBHealth } from './db/connection.js';
import { startDBConsumer, closeDBConsumer } from './consumers/dbConsumer.js';
import { setupRoutes } from './routes/api.routes.js';

async function startBBDDService() {
  const fastify = Fastify({
    logger: {
      level: config.get('logging.level') || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      }
    }
  });

  // Conectar a la base de datos
  try {
    await connectDB();
  } catch (error) {
    fastify.log.error('Failed to connect to database:', error);
    process.exit(1);
  }

  // Iniciar consumer RabbitMQ
  try {
    await startDBConsumer();
  } catch (error) {
    fastify.log.error('Failed to start RabbitMQ consumer:', error);
    process.exit(1);
  }

  // Error handler global
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({
      error: error.message,
      statusCode: error.statusCode,
      url: request.url,
      method: request.method
    });

    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      statusCode: error.statusCode || 500,
      timestamp: new Date().toISOString()
    });
  });

  // Hook para loguear requests
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.includes('/health') && !request.url.includes('/metrics')) {
      fastify.log.info({
        method: request.method,
        url: request.url,
        ip: request.ip
      });
    }
  });

  // Registrar rutas
  await setupRoutes(fastify);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    fastify.log.info('SIGTERM received, graceful shutdown initiated');
    await closeDBConsumer();
    await closeDB();
    await fastify.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    fastify.log.info('SIGINT received, graceful shutdown initiated');
    await closeDBConsumer();
    await closeDB();
    await fastify.close();
    process.exit(0);
  });

  // Iniciar servidor
  const port = config.get('bbdd.port');
  const host = config.get('bbdd.host');

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`↓ BBDD Service escuchando en http://${host}:${port}`);
    fastify.log.info(`↓ RabbitMQ: ${process.env.RABBITMQ_URL || config.get('rabbitmq.url')}`);
  } catch (error) {
    fastify.log.error('Error iniciando BBDD Service:', error);
    await closeDBConsumer();
    await closeDB();
    process.exit(1);
  }
}

startBBDDService();
