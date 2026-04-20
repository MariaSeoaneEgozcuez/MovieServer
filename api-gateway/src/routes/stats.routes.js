import { statsService, bbddService } from '../lib/serviceClient.js';

export async function setupStatsRoutes(fastify) {
  // GET /api/stats - Estadísticas del sistema
  fastify.get('/api/stats', {
    schema: {
      tags: ['Stats'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            stats: {
              type: 'object',
              properties: {
                total_users: { type: 'integer' },
                revoked_tokens: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await statsService.get('/stats');
      reply.send({
        status: 'success',
        stats: result
      });
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });

  // GET /api/stats/users/:userId - Stats específicas de usuario
  fastify.get('/api/stats/users/:userId', {
    schema: {
      tags: ['Stats'],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await statsService.get(`/stats/users/${request.params.userId}`);
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });
}