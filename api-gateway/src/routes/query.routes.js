import { queryService, llmService, bbddService } from '../lib/serviceClient.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { v4 as uuidv4 } from 'uuid';

// Storage para tracking de queries en progreso (en producción usar Redis)
const queryProgress = new Map();

export async function setupQueryRoutes(fastify) {
  // POST /api/query - Obtener recomendaciones (via RabbitMQ ASYNC)
  fastify.post('/api/query', {
    preHandler: authenticateToken,
    schema: {
      tags: ['Query'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' }
        }
      },
      response: {
        202: {
          description: 'Request accepted for async processing',
          type: 'object',
          properties: {
            status: { type: 'string' },
            queryId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const queryId = uuidv4();
    const user = request.user;

    try {
      // Guardar en progreso
      queryProgress.set(queryId, {
        status: 'processing',
        startTime: Date.now(),
        query: request.body.query,
        userId: user.id
      });

      // Enviar a Query Service vía RabbitMQ (NO esperar respuesta)
      queryService.post('/query/process', {
        query: request.body.query,
        userId: user.id,
        queryId
      }).then((result) => {
        // Cuando termina, guardar resultado
        const progress = queryProgress.get(queryId);
        if (progress) {
          progress.status = 'completed';
          progress.result = result;
          progress.endTime = Date.now();
        }
      }).catch((error) => {
        // Si falla, guardar error
        const progress = queryProgress.get(queryId);
        if (progress) {
          progress.status = 'failed';
          progress.error = error.message;
          progress.endTime = Date.now();
        }
      });

      // Responder inmediatamente con ID para tracking
      reply.code(202).send({
        status: 'accepted',
        queryId,
        message: 'Query enviada para procesamiento. Usa GET /api/query/{queryId} para obtener el estado.',
        statusUrl: `/api/query/status/${queryId}`
      });
    } catch (error) {
      console.error('Query submission error:', error);
      queryProgress.delete(queryId);
      reply.code(500).send({
        error: error.message
      });
    }
  });

  // GET /api/query/status/:queryId - Obtener estado de una query en progreso
  fastify.get('/api/query/status/:queryId', {
    preHandler: authenticateToken,
    schema: {
      tags: ['Query'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          queryId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { queryId } = request.params;

    const progress = queryProgress.get(queryId);

    if (!progress) {
      return reply.code(404).send({
        error: 'Query not found',
        queryId
      });
    }

    reply.send({
      queryId,
      status: progress.status,
      startTime: progress.startTime,
      endTime: progress.endTime,
      duration: progress.endTime ? progress.endTime - progress.startTime : null,
      ...(progress.status === 'completed' && { result: progress.result }),
      ...(progress.status === 'failed' && { error: progress.error })
    });
  });

  // GET /api/llm - Direct LLM call (admin/debug via HTTP)
  fastify.get('/api/llm', async (request, reply) => {
    try {
      const { msg } = request.query;
      if (!msg) {
        return reply.code(400).send({ error: 'msg parameter required' });
      }

      // Para debug, hacer llamada HTTP directa (timeout más corto)
      const result = await llmService.get(`/llm?msg=${encodeURIComponent(msg)}`);
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({
        error: error.message
      });
    }
  });

  // POST /api/external - External IA query (debug via HTTP)
  fastify.post('/api/external', {
    schema: {
      tags: ['Query'],
      body: {
        type: 'object',
        required: ['solicitud'],
        properties: {
          solicitud: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Debug endpoint - usar HTTP directo
      const result = await llmService.post('/external', request.body);
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({
        error: error.message
      });
    }
  });
}