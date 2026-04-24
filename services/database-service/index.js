import * as amqp from 'amqplib';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';
import { MESSAGE_TYPES, createReply, createErrorReply } from './messages.js';

let channel;
let db;

async function connectDB() {
  db = await open({
    filename: config.get('db.filename'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS RevokedTokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database initialized');
}

async function connectRabbitMQ() {
  const connection = await amqp.connect(config.get('rabbitmq.url'));
  channel = await connection.createChannel();
  await channel.assertQueue('database-service');
  console.log('Database Service connected to RabbitMQ');
}

async function handleMessage(msg) {
  const message = JSON.parse(msg.content.toString());
  let response;

  try {
    switch (message.type) {
      case MESSAGE_TYPES.DB_USER_GET:
        const user = await db.get('SELECT * FROM Usuarios WHERE username = ?', [message.payload.username]);
        response = createReply(message, user);
        break;

      case MESSAGE_TYPES.DB_USER_CREATE:
        const result = await db.run('INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)', 
          [message.payload.username, message.payload.email, message.payload.password]);
        response = createReply(message, { id: result.lastID, ...message.payload });
        break;

      case MESSAGE_TYPES.DB_TOKEN_REVOKE:
        await db.run('INSERT INTO RevokedTokens (token) VALUES (?)', [message.payload.token]);
        response = createReply(message, { success: true });
        break;

      case MESSAGE_TYPES.DB_TOKEN_CHECK:
        const token = await db.get('SELECT id FROM RevokedTokens WHERE token = ?', [message.payload.token]);
        response = createReply(message, !!token);
        break;

      case MESSAGE_TYPES.DB_STATS:
        const totalUsers = await db.get('SELECT COUNT(*) as count FROM Usuarios');
        const revokedTokens = await db.get('SELECT COUNT(*) as count FROM RevokedTokens');
        response = createReply(message, {
          total_users: totalUsers.count,
          revoked_tokens: revokedTokens.count
        });
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
  await connectDB();
  await connectRabbitMQ();
  channel.consume('database-service', handleMessage);
  console.log('Database Service started');
}

start();