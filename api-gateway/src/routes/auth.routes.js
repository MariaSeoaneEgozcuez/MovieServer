import { authService } from '../lib/serviceClient.js';

export async function setupAuthRoutes(fastify) {
  // POST /auth/register
  fastify.post('/auth/register', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await authService.post('/auth/register', request.body);
      reply.code(201).send(result);
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });

  // POST /auth/login
  fastify.post('/auth/login', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await authService.post('/auth/login', request.body);
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });

  // GET /auth/verify
  fastify.get('/auth/verify', {
    schema: { tags: ['Auth'] },
    preHandler: async (request, reply) => {
      const authHeader = request.headers['authorization'];
      if (!authHeader) {
        reply.code(401).send({ error: 'Token no proporcionado' });
      }
    }
  }, async (request, reply) => {
    try {
      const token = request.headers['authorization'].split(' ')[1];
      const result = await authService.get('/auth/verify', {
        'Authorization': `Bearer ${token}`
      });
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });

  // POST /auth/logout
  fastify.post('/auth/logout', {
    schema: { tags: ['Auth'] }
  }, async (request, reply) => {
    try {
      const token = request.headers['authorization']?.split(' ')[1];
      const result = await authService.post('/auth/logout', { token });
      reply.send(result);
    } catch (error) {
      reply.code(error.status || 500).send({ 
        error: error.message 
      });
    }
  });
}