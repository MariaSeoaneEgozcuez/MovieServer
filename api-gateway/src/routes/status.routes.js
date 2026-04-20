import config from 'config';
import { checkServicesHealth } from '../lib/serviceClient.js';
import { checkRabbitMQHealth } from '../lib/rabbitmqClient.js';

export async function setupStatusRoutes(fastify) {
  // GET / - Root endpoint
  fastify.get('/', async (request, reply) => {
    reply.send({ 
      message: 'API Gateway funcionando',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/status - Status del servidor
  fastify.get('/api/status', {
    schema: {
      tags: ['System'],
      summary: 'Estado del servidor'
    }
  }, async (request, reply) => {
    reply.send({ 
      status: 'ok', 
      message: 'El servidor funciona correctamente.',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/telegram - Test de integración Telegram
  fastify.get('/api/telegram', {
    schema: {
      tags: ['Telegram'],
      summary: 'Prueba de API Telegram'
    }
  }, async (request, reply) => {
    reply.send({ 
      status: 'success', 
      message: '¡Bienvenido a la API de Telegram!',
      timestamp: new Date().toISOString()
    });
  });

  // GET /health - Kubernetes-style health check
  fastify.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check del Gateway',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            gateway: { type: 'object' },
            messaging: { type: 'object' },
            services: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      gateway: {
        port: config.get('gateway.port'),
        uptime: process.uptime()
      },
      messaging: await checkRabbitMQHealth(),
      services: await checkServicesHealth()
    };

    // Determinar si hay servicios críticos caídos
    const criticalServices = ['auth', 'bbdd'];
    const allServicesUp = criticalServices.every(
      svc => health.services[svc]?.status === 'up'
    );

    if (!allServicesUp || health.messaging.status === 'down') {
      health.status = 'degraded';
    }

    reply.code(health.status === 'healthy' ? 200 : 503).send(health);
  });

  // GET /health/live - Liveness probe (¿está corriendo?)
  fastify.get('/health/live', {
    schema: {
      tags: ['System'],
      summary: 'Liveness probe'
    }
  }, async (request, reply) => {
    reply.send({ status: 'alive' });
  });

  // GET /health/ready - Readiness probe (¿está listo para recibir tráfico?)
  fastify.get('/health/ready', {
    schema: {
      tags: ['System'],
      summary: 'Readiness probe'
    }
  }, async (request, reply) => {
    const services = await checkServicesHealth();
    const criticalServicesReady = ['auth', 'bbdd'].every(
      svc => services[svc]?.status === 'up'
    );

    if (criticalServicesReady) {
      reply.send({ status: 'ready' });
    } else {
      reply.code(503).send({ status: 'not_ready', services });
    }
  });

  // GET /metrics - Métricas básicas
  fastify.get('/metrics', {
    schema: {
      tags: ['System'],
      summary: 'Métricas del Gateway'
    }
  }, async (request, reply) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    reply.send({
      timestamp: new Date().toISOString(),
      process: {
        uptime,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
        }
      },
      services: await checkServicesHealth()
    });
  });
}