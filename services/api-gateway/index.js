import Fastify from 'fastify';
import * as amqp from 'amqplib';
import config from 'config';
import { MESSAGE_TYPES, createMessage, createReply } from './messages.js';

const fastify = Fastify();
let channel;

async function connectRabbitMQ() {
  const connection = await amqp.connect(config.get('rabbitmq.url'));
  channel = await connection.createChannel();
  console.log('API Gateway connected to RabbitMQ');
}

async function sendRequest(queue, message) {
  return new Promise((resolve, reject) => {
    const replyQueue = channel.assertQueue('', { exclusive: true });
    replyQueue.then((q) => {
      const correlationId = message.correlationId;
      channel.consume(q.queue, (msg) => {
        if (msg.properties.correlationId === correlationId) {
          resolve(JSON.parse(msg.content.toString()));
          channel.ack(msg);
        }
      }, { noAck: false });

      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        correlationId,
        replyTo: q.queue
      });
    });
  });
}

fastify.register(async (fastify) => {
  await connectRabbitMQ();

  // Auth endpoints
  fastify.post('/api/auth/register', async (request, reply) => {
    const message = createMessage(MESSAGE_TYPES.AUTH_REGISTER, request.body);
    const response = await sendRequest('auth-service', message);
    return response;
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const message = createMessage(MESSAGE_TYPES.AUTH_LOGIN, request.body);
    const response = await sendRequest('auth-service', message);
    return response;
  });

  fastify.get('/api/auth/verify', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const message = createMessage(MESSAGE_TYPES.AUTH_VERIFY, { token });
    const response = await sendRequest('auth-service', message);
    return response;
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const message = createMessage(MESSAGE_TYPES.AUTH_LOGOUT, { token });
    const response = await sendRequest('auth-service', message);
    return response;
  });

  // Query endpoint - async
  fastify.post('/api/query', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const message = createMessage(MESSAGE_TYPES.LLM_REQUEST, { query: request.body.query, token });
    // For async, just send and return request id
    channel.sendToQueue('llm-service', Buffer.from(JSON.stringify(message)));
    return { requestId: message.correlationId, status: 'processing' };
  });

  // Status
  fastify.get('/api/status', async (request, reply) => {
    return { status: 'ok', message: 'API Gateway is running' };
  });

  // Stats
  fastify.get('/api/stats', async (request, reply) => {
    const message = createMessage(MESSAGE_TYPES.DB_STATS, {});
    const response = await sendRequest('database-service', message);
    return response;
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: config.get('server.port'), host: '0.0.0.0' });
    console.log(`API Gateway listening on port ${config.get('server.port')}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();