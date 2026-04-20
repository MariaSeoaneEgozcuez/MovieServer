import * as userService from '../services/userService.js';
import * as tokenService from '../services/tokenService.js';

export async function setupRoutes(fastify) {
  // ====== USER ENDPOINTS ======

  // GET /users/username/:username
  fastify.get('/users/username/:username', {
    schema: {
      tags: ['Users'],
      params: {
        type: 'object',
        properties: {
          username: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = await userService.getUserbyUsername(request.params.username);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      // No retornar el password
      const { password, ...userWithoutPassword } = user;
      reply.send(userWithoutPassword);
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // GET /users/email/:email
  fastify.get('/users/email/:email', {
    schema: {
      tags: ['Users'],
      params: {
        type: 'object',
        properties: {
          email: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = await userService.getUserbyEmail(request.params.email);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const { password, ...userWithoutPassword } = user;
      reply.send(userWithoutPassword);
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // GET /users/:id
  fastify.get('/users/:id', {
    schema: {
      tags: ['Users'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = await userService.getUserById(parseInt(request.params.id));
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const { password, ...userWithoutPassword } = user;
      reply.send(userWithoutPassword);
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // ====== TOKEN ENDPOINTS ======

  // POST /tokens/verify
  fastify.post('/tokens/verify', {
    schema: {
      tags: ['Tokens'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const revoked = await tokenService.isTokenRevoked(request.body.token);
      reply.send({ revoked });
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // ====== STATS ENDPOINTS ======

  // GET /stats
  fastify.get('/stats', {
    schema: {
      tags: ['Stats'],
      response: {
        200: {
          type: 'object',
          properties: {
            total_users: { type: 'integer' },
            revoked_tokens: { type: 'integer' },
            operations_24h: { type: 'integer' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const stats = await userService.getSystemStats();
      reply.send(stats);
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // GET /stats/tokens
  fastify.get('/stats/tokens', {
    schema: {
      tags: ['Stats']
    }
  }, async (request, reply) => {
    try {
      const stats = await tokenService.getRevokedTokensStats();
      reply.send(stats);
    } catch (error) {
      reply.code(error.status || 500).send({ error: error.message });
    }
  });

  // ====== HEALTH ENDPOINTS ======

  // GET /health
  fastify.get('/health', {
    schema: {
      tags: ['System']
    }
  }, async (request, reply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'bbdd-service'
    });
  });

  // GET /health/live
  fastify.get('/health/live', async (request, reply) => {
    reply.send({ status: 'alive' });
  });

  // GET /health/ready
  fastify.get('/health/ready', async (request, reply) => {
    // Para BBDD, simplemente verificar que está corriendo
    reply.send({ status: 'ready' });
  });

  // ====== ROOT ENDPOINTS ======

  // GET /
  fastify.get('/', {
    schema: {
      tags: ['System']
    }
  }, async (request, reply) => {
    reply.send({
      message: 'BBDD Service - Microservicio de Persistencia',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
}
