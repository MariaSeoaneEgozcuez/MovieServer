import * as amqp from 'amqplib';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from 'config';
import { MESSAGE_TYPES, createReply, createErrorReply } from './messages.js';

let channel;

async function connectRabbitMQ() {
  const connection = await amqp.connect(config.get('rabbitmq.url'));
  channel = await connection.createChannel();
  await channel.assertQueue('auth-service');
  console.log('Auth Service connected to RabbitMQ');
}

async function sendToDB(message) {
  return new Promise((resolve) => {
    const replyQueue = channel.assertQueue('', { exclusive: true });
    replyQueue.then((q) => {
      channel.consume(q.queue, (msg) => {
        if (msg.properties.correlationId === message.correlationId) {
          resolve(JSON.parse(msg.content.toString()));
        }
      }, { noAck: false });

      channel.sendToQueue('database-service', Buffer.from(JSON.stringify(message)), {
        correlationId: message.correlationId,
        replyTo: q.queue
      });
    });
  });
}

async function handleMessage(msg) {
  const message = JSON.parse(msg.content.toString());
  let response;

  try {
    switch (message.type) {
      case MESSAGE_TYPES.AUTH_REGISTER:
        const { username, email, password } = message.payload;
        const hashedPassword = await bcrypt.hash(password, 10);
        const createMsg = { type: MESSAGE_TYPES.DB_USER_CREATE, payload: { username, email, password: hashedPassword } };
        const dbResponse = await sendToDB(createMsg);
        response = createReply(message, dbResponse);
        break;

      case MESSAGE_TYPES.AUTH_LOGIN:
        const { username: uname, password: pwd } = message.payload;
        const getMsg = { type: MESSAGE_TYPES.DB_USER_GET, payload: { username: uname } };
        const user = await sendToDB(getMsg);
        if (!user || !(await bcrypt.compare(pwd, user.password))) {
          throw new Error('Invalid credentials');
        }
        const token = jwt.sign({ id: user.id, username: user.username }, config.get('jwt.secret'), { expiresIn: '1h' });
        response = createReply(message, { token, user });
        break;

      case MESSAGE_TYPES.AUTH_VERIFY:
        const { token: verifyToken } = message.payload;
        const decoded = jwt.verify(verifyToken, config.get('jwt.secret'));
        const checkMsg = { type: MESSAGE_TYPES.DB_TOKEN_CHECK, payload: { token: verifyToken } };
        const isRevoked = await sendToDB(checkMsg);
        if (isRevoked) throw new Error('Token revoked');
        response = createReply(message, { valid: true, user: decoded });
        break;

      case MESSAGE_TYPES.AUTH_LOGOUT:
        const { token: logoutToken } = message.payload;
        const revokeMsg = { type: MESSAGE_TYPES.DB_TOKEN_REVOKE, payload: { token: logoutToken } };
        await sendToDB(revokeMsg);
        response = createReply(message, { message: 'Logged out' });
        break;

      default:
        throw new Error('Unknown message type');
    }
  } catch (error) {
    response = createErrorReply(message, error);
  }

  channel.sendToQueue(message.replyTo, Buffer.from(JSON.stringify(response)), {
    correlationId: message.correlationId
  });
  channel.ack(msg);
}

async function start() {
  await connectRabbitMQ();
  channel.consume('auth-service', handleMessage);
  console.log('Auth Service started');
}

start();