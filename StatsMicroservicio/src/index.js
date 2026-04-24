import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', service: 'stats-service' };
});

fastify.get('/stats', async (request, reply) => {
  try {
    const response = await fetch('http://bbdd-service:3003/stats');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({ error: 'Failed to fetch stats from database service' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3005, host: '0.0.0.0' });
    fastify.log.info('Stats service listening on port 3005');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();