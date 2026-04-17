import amqp from 'amqplib';
import config from 'config';
import * as userService from '../services/userService.js';
import * as tokenService from '../services/tokenService.js';
import { logOperation } from './utils.js';

let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || config.get('rabbitmq.url');
const REQUEST_QUEUE = 'bbdd.requests';
const RESPONSE_QUEUE = 'gateway.reply';

/**
 * Conectar y configurar consumer de RabbitMQ
 */
export async function startDBConsumer() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);

    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      console.error('RabbitMQ connection closed');
    });

    channel = await connection.createChannel();

    // Crear cola de requests
    await channel.assertQueue(REQUEST_QUEUE, { durable: true });

    // Crear cola de respuestas
    await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

    // Prefetch: procesar un mensaje a la vez
    await channel.prefetch(config.get('rabbitmq.prefetch') || 1);

    console.log(`✓ BBDD Consumer listening on ${REQUEST_QUEUE}`);

    // Empezar a consumir
    channel.consume(REQUEST_QUEUE, async (msg) => {
      if (!msg) return;

      const startTime = Date.now();
      const correlationId = msg.properties.correlationId;

      try {
        const request = JSON.parse(msg.content.toString());

        console.log(`[RPC] Received: ${request.operation} (${correlationId})`);

        // Procesar request según operación
        const response = await processRequest(request);

        // Responder
        channel.sendToQueue(
          RESPONSE_QUEUE,
          Buffer.from(JSON.stringify(response)),
          {
            correlationId,
            contentType: 'application/json'
          }
        );

        const duration = Date.now() - startTime;
        console.log(`[RPC] Responded: ${request.operation} in ${duration}ms`);

        // Acknowledge
        channel.ack(msg);
      } catch (error) {
        console.error(`[RPC ERROR] ${error.message}`, error);

        // Responder con error
        try {
          channel.sendToQueue(
            RESPONSE_QUEUE,
            Buffer.from(JSON.stringify({
              error: error.message || 'Internal server error',
              status: error.status || 500
            })),
            {
              correlationId,
              contentType: 'application/json'
            }
          );
        } catch (sendError) {
          console.error('Failed to send error response:', sendError.message);
        }

        // Acknowledge de todas formas
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
  const { operation, payload } = request;

  switch (operation) {
    // USER OPERATIONS
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

    // TOKEN OPERATIONS
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

    // STATS OPERATIONS
    case 'stats.system':
      return await userService.getSystemStats();

    case 'stats.tokens':
      return await tokenService.getRevokedTokensStats();

    default:
      throw {
        status: 400,
        message: `Unknown operation: ${operation}`
      };
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
    console.log('✓ BBDD Consumer closed');
  } catch (error) {
    console.error('Error closing BBDD Consumer:', error.message);
  }
}
