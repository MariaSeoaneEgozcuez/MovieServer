import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import config from 'config';

let connection = null;
let channel = null;
const pendingRequests = new Map();

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ||
  (config.has('rabbitmq.url')
    ? config.get('rabbitmq.url')
    : 'amqp://guest:guest@localhost:5672');

const REPLY_QUEUE = 'gateway.reply';

export async function connectRabbitMQ() {
  if (channel) {
    return channel;
  }

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      console.error('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    await channel.assertQueue(REPLY_QUEUE, { durable: true });

    await channel.consume(
      REPLY_QUEUE,
      (msg) => {
        if (!msg) return;

        const correlationId = msg.properties.correlationId;
        const pending = pendingRequests.get(correlationId);

        if (pending) {
          try {
            const content = JSON.parse(msg.content.toString());
            console.log(`[RPC] Response received for correlationId ${correlationId}`);
            pending.resolve(content);
          } catch (error) {
            pending.reject(new Error(`Failed to parse response: ${error.message}`));
          } finally {
            pendingRequests.delete(correlationId);
          }
        }

        channel.ack(msg);
      },
      { noAck: false }
    );

    console.log(`Connected to RabbitMQ successfully: ${RABBITMQ_URL}`);
    return channel;
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error.message);
    throw error;
  }
}

export async function closeRabbitMQ() {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
  } finally {
    channel = null;
    connection = null;
  }
}

export async function sendRPCRequest(queue, payload, timeout = 30000) {
  const ch = await connectRabbitMQ();
  const correlationId = uuidv4();

  await ch.assertQueue(queue, { durable: true });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(correlationId);
      reject(new Error(`RPC timeout for queue ${queue} after ${timeout}ms`));
    }, timeout);

    pendingRequests.set(correlationId, {
      resolve: (data) => {
        clearTimeout(timer);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
    });

    const message = {
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      correlationId,
      payload
    };

    ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      correlationId,
      replyTo: REPLY_QUEUE,
      persistent: true,
      contentType: 'application/json'
    });

    console.log(`[RPC] Sent to ${queue} with correlationId ${correlationId}`);
  });
}

export async function publishEvent(exchangeName, routingKey, payload) {
  const ch = await connectRabbitMQ();

  await ch.assertExchange(exchangeName, 'direct', { durable: true });

  const message = {
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    type: routingKey,
    payload
  };

  ch.publish(
    exchangeName,
    routingKey,
    Buffer.from(JSON.stringify(message)),
    {
      persistent: true,
      contentType: 'application/json'
    }
  );

  console.log(`[PUBLISH] Event to exchange ${exchangeName}:${routingKey}`);
}

export async function checkRabbitMQHealth() {
  try {
    await connectRabbitMQ();
    return { status: 'up', url: RABBITMQ_URL };
  } catch (error) {
    return {
      status: 'down',
      url: RABBITMQ_URL,
      error: error.message
    };
  }
}