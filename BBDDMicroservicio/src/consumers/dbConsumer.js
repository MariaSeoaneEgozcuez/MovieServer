import amqp from 'amqplib';
import config from 'config';
import * as userService from '../services/userService.js';
import * as tokenService from '../services/tokenService.js';

let channel = null;
let connection = null;

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ||
  (config.has('rabbitmq.url')
    ? config.get('rabbitmq.url')
    : 'amqp://guest:guest@localhost:5672');

const REQUEST_QUEUE = 'bbdd.requests';
const MAX_RETRIES = 15;
const INITIAL_DELAY = 3000;

/**
 * Conectar a RabbitMQ con reintentos
 */
async function connectWithRetries(url, maxRetries = MAX_RETRIES, delay = INITIAL_DELAY) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RabbitMQ] Intento de conexión ${attempt}/${maxRetries}...`);
      const conn = await amqp.connect(url);
      console.log(`✓ RabbitMQ conectado en: ${url}`);
      return conn;
    } catch (error) {
      console.error(`✗ Intento ${attempt} falló:`, error.message);

      if (attempt < maxRetries) {
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`  Esperando ${waitTime}ms antes de reintentar...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw new Error(`No se pudo conectar a RabbitMQ después de ${maxRetries} intentos`);
      }
    }
  }
}

/**
 * Conectar y configurar consumer de RabbitMQ
 */
export async function startDBConsumer() {
  try {
    connection = await connectWithRetries(RABBITMQ_URL);

    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      console.error('RabbitMQ connection closed');
      channel = null;
      connection = null;
    });

    channel = await connection.createChannel();

    await channel.assertQueue(REQUEST_QUEUE, { durable: true });

    await channel.prefetch(
      config.has('rabbitmq.prefetch') ? config.get('rabbitmq.prefetch') : 1
    );

    console.log(`✓ BBDD Consumer listening on ${REQUEST_QUEUE}`);
    console.log(`✓ RabbitMQ URL: ${RABBITMQ_URL}`);

    channel.consume(REQUEST_QUEUE, async (msg) => {
      if (!msg) return;

      const startTime = Date.now();
      const correlationId = msg.properties.correlationId;
      const replyTo = msg.properties.replyTo;

      try {
        const request = JSON.parse(msg.content.toString());

        console.log(`[BBDD RPC] Received operation "${request.operation}" (${correlationId})`);

        const response = await processRequest(request);

        if (replyTo) {
          channel.sendToQueue(
            replyTo,
            Buffer.from(JSON.stringify(response)),
            {
              correlationId,
              persistent: true,
              contentType: 'application/json'
            }
          );
        } else {
          console.warn('[BBDD RPC] No replyTo provided, response not sent');
        }

        const duration = Date.now() - startTime;
        console.log(`[BBDD RPC] Responded "${request.operation}" in ${duration}ms`);

        channel.ack(msg);
      } catch (error) {
        const errorMessage = error?.message || 'Internal server error';
        const errorStatus = error?.status || 500;

        console.error(`[BBDD RPC ERROR] ${errorMessage}`, error);

        try {
          if (replyTo) {
            channel.sendToQueue(
              replyTo,
              Buffer.from(JSON.stringify({
                error: errorMessage,
                status: errorStatus
              })),
              {
                correlationId,
                persistent: true,
                contentType: 'application/json'
              }
            );
          } else {
            console.warn('[BBDD RPC ERROR] No replyTo provided, error response not sent');
          }
        } catch (sendError) {
          console.error('[BBDD RPC ERROR] Failed to send error response:', sendError.message);
        }

        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error('✗ Failed to start BBDD Consumer:', error.message);
    throw error;
  }
}

/**
 * Procesar mensajes RPC según operación
 */
async function processRequest(request) {
  const { operation, payload } = request.payload || {};

  switch (operation) {
    case 'user.get_by_username':
      return await userService.getUserbyUsername(payload.username);

    case 'user.get_by_email':
      return await userService.getUserbyEmail(payload.email);

    case 'user.get_by_id':
      return await userService.getUserById(payload.userId);

    case 'user.create':
      return await userService.createUser(
        payload.username,
        payload.email,
        payload.password
      );

    case 'user.update':
      return await userService.updateUser(payload.userId, payload.updates);

    case 'user.delete':
      return await userService.deleteUser(payload.userId);

    case 'token.revoke':
      return await tokenService.revokeToken(
        payload.token,
        payload.expiresAt
      );

    case 'token.is_revoked':
      return { revoked: await tokenService.isTokenRevoked(payload.token) };

    case 'token.clean_expired':
      return await tokenService.cleanExpiredTokens();

    case 'token.stats':
      return await tokenService.getRevokedTokensStats();

    case 'stats.system':
      return await userService.getSystemStats();

    case 'stats.tokens':
      return await tokenService.getRevokedTokensStats();

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
/**
 * Cerrar conexión a RabbitMQ
 */
export async function closeDBConsumer() {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    channel = null;
    connection = null;
    console.log('✓ BBDD Consumer closed');
  } catch (error) {
    console.error('Error closing BBDD Consumer:', error.message);
  }
}