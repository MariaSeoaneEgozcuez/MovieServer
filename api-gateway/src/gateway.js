import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import config from 'config';

import { setupAuthRoutes } from './routes/auth.routes.js';
import { setupQueryRoutes } from './routes/query.routes.js';
import { setupStatsRoutes } from './routes/stats.routes.js';
import { setupStatusRoutes } from './routes/status.routes.js';

import { connectRabbitMQ, closeRabbitMQ } from './lib/rabbitmqClient.js';

async function startGateway() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      }
    }
  });

  // CORS
  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'MovieServer API Gateway',
        version: '1.0.0',
        description: 'API Gateway para arquitectura de microservicios con soporte HTTP y RabbitMQ'
      },
      servers: [
        {
          url: `http://localhost:${config.get('gateway.port')}`,
          description: 'Development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT obtenido en /auth/login'
          }
        }
      }
    }
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      defaultModelsExpandDepth: 1
    }
  });

  // Conectar a RabbitMQ al iniciar (no fallar si no está disponible)
  try {
    await connectRabbitMQ();
    fastify.log.info('RabbitMQ connected successfully');
  } catch (error) {
    fastify.log.warn('RabbitMQ not available, will attempt to reconnect');
    fastify.log.warn(error.message);
    // No fallar el startup si RabbitMQ no está disponible
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
  await setupStatusRoutes(fastify);
  await setupAuthRoutes(fastify);
  await setupQueryRoutes(fastify);
  await setupStatsRoutes(fastify);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    fastify.log.info('SIGTERM recibido, graceful shutdown iniciado');
    await fastify.close();
    await closeRabbitMQ();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    fastify.log.info('SIGINT recibido, graceful shutdown iniciado');
    await fastify.close();
    await closeRabbitMQ();
    process.exit(0);
  });

  // Iniciar servidor
  const port = config.get('gateway.port');
  const host = config.get('gateway.host');

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`↓ API Gateway escuchando en http://${host}:${port}`);
    fastify.log.info(`↓ Documentación disponible en http://${host}:${port}/api/docs`);
    fastify.log.info(`↓ Health check en http://${host}:${port}/health`);
  } catch (error) {
    fastify.log.error('Error iniciando API Gateway:');
    fastify.log.error(error);
    await closeRabbitMQ();
    process.exit(1);
  }
}

startGateway();