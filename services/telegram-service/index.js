import * as amqp from 'amqplib';
import { Telegraf, session } from 'telegraf';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MESSAGE_TYPES, createMessage } from './messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration directly
const configPath = join(__dirname, 'config', 'default.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

console.log('Config loaded:', JSON.stringify(config, null, 2));

let channel;
let bot;
const requestMap = new Map(); // Map of requestId -> { userId, chatId }

async function connectRabbitMQ() {
  const connection = await amqp.connect(config.rabbitmq.url);
  channel = await connection.createChannel();
  console.log('Telegram Service connected to RabbitMQ');
}

function initBot() {
  const botToken = config.telegram.botToken;
  console.log('Bot token from config:', botToken);
  console.log('Bot token length:', botToken ? botToken.length : 'null');
  if (!botToken || botToken.trim() === '') {
    throw new Error('Bot token is not configured or is empty');
  }
  try {
    bot = new Telegraf(botToken.trim());
    console.log('Telegraf instance created successfully');
    bot.use(session());

    bot.start((ctx) => {
      ctx.reply('Bienvenido a MovieServer. Envía una consulta para recomendaciones.');
    });

    bot.on('text', async (ctx) => {
      const query = ctx.message.text;
      const userId = ctx.from.id;
      const chatId = ctx.chat.id;
      const requestId = uuidv4();
      
      // Store the correlation between requestId and user info
      requestMap.set(requestId, { userId, chatId });
      
      const message = createMessage(MESSAGE_TYPES.LLM_REQUEST, { query, userId: ctx.from.id });
      message.correlationId = requestId; // Add correlation ID
      channel.sendToQueue('llm-service', Buffer.from(JSON.stringify(message)));
      ctx.reply('Procesando tu solicitud...');
    });
  } catch (error) {
    console.error('Error creating Telegraf instance:', error);
    throw error;
  }
}

// Listen for LLM responses and send back to user
async function listenForResponses() {
  await channel.assertQueue('telegram-responses');
  channel.consume('telegram-responses', async (msg) => {
    if (!msg) return;
    
    try {
      const response = JSON.parse(msg.content.toString());
      console.log('Received response:', response);
      
      if (response.type === MESSAGE_TYPES.LLM_RESPONSE && response.correlationId) {
        const userInfo = requestMap.get(response.correlationId);
        console.log('User info for correlation:', response.correlationId, userInfo);
        
        if (userInfo) {
          // Send message to user
          await bot.telegram.sendMessage(
            userInfo.chatId,
            `Recomendación: ${response.payload.recommendation}`
          );
          // Clean up the mapping
          requestMap.delete(response.correlationId);
        } else {
          console.warn('No user info found for correlation:', response.correlationId);
        }
      }
      channel.ack(msg);
    } catch (error) {
      console.error('Error processing response:', error);
      channel.nack(msg);
    }
  });
}

async function start() {
  try {
    console.log('Starting Telegram service...');
    await connectRabbitMQ();
    console.log('Initializing bot...');
    initBot();
    console.log('Starting to listen for responses...');
    await listenForResponses();
    console.log('Launching bot...');
    bot.launch();
    console.log('Telegram Service started');
  } catch (error) {
    console.error('Error starting service:', error);
    process.exit(1);
  }
}

start();