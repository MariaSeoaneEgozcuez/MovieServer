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
const userSessions = new Map(); // Map of userId -> { authenticated: boolean, token: string, username: string }

async function connectRabbitMQ() {
  let retries = 0;
  const maxRetries = 10;
  
  while (retries < maxRetries) {
    try {
      const connection = await amqp.connect(config.rabbitmq.url);
      channel = await connection.createChannel();
      await channel.assertQueue('telegram-service');
      await channel.assertQueue('telegram-responses');
      console.log('Telegram Service connected to RabbitMQ');
      return;
    } catch (error) {
      console.log(`Failed to connect to RabbitMQ (attempt ${retries + 1}/${maxRetries}):`, error.message);
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }
    }
  }
  throw new Error('Failed to connect to RabbitMQ after maximum retries');
}

async function sendToAuth(message) {
  return new Promise((resolve) => {
    const replyQueue = channel.assertQueue('', { exclusive: true });
    replyQueue.then((q) => {
      channel.consume(q.queue, (msg) => {
        if (msg.properties.correlationId === message.correlationId) {
          resolve(JSON.parse(msg.content.toString()));
        }
      }, { noAck: false });

      channel.sendToQueue('auth-service', Buffer.from(JSON.stringify(message)), {
        correlationId: message.correlationId,
        replyTo: q.queue
      });
    });
  });
}

function isUserAuthenticated(userId) {
  const session = userSessions.get(userId);
  return session && session.authenticated && session.token;
}

async function handleAuthFlow(ctx, session, text) {
  const userId = ctx.from.id;

  try {
    switch (session.state) {
      case 'waiting_username':
        session.data.username = text;
        session.state = 'waiting_email';
        ctx.reply('Ingresa tu email:');
        break;

      case 'waiting_email':
        session.data.email = text;
        session.state = 'waiting_password';
        ctx.reply('Ingresa tu contraseña:');
        break;

      case 'waiting_password':
        session.data.password = text;
        // Register user
        const registerMsg = createMessage(MESSAGE_TYPES.AUTH_REGISTER, session.data);
        const registerResponse = await sendToAuth(registerMsg);
        
        if (registerResponse.type === 'auth.register.reply') {
          userSessions.set(userId, { 
            authenticated: true, 
            token: registerResponse.payload.token,
            username: session.data.username 
          });
          ctx.reply('¡Registro exitoso! Ya puedes pedir recomendaciones de películas.');
        } else {
          ctx.reply('Error en el registro: ' + (registerResponse.payload?.message || 'Error desconocido'));
          userSessions.delete(userId);
        }
        break;

      case 'login_waiting_username':
        session.data.username = text;
        session.state = 'login_waiting_password';
        ctx.reply('Ingresa tu contraseña:');
        break;

      case 'login_waiting_password':
        session.data.password = text;
        // Login user
        const loginMsg = createMessage(MESSAGE_TYPES.AUTH_LOGIN, session.data);
        const loginResponse = await sendToAuth(loginMsg);
        
        if (loginResponse.type === 'auth.login.reply') {
          userSessions.set(userId, { 
            authenticated: true, 
            token: loginResponse.payload.token,
            username: session.data.username 
          });
          ctx.reply('¡Login exitoso! Ya puedes pedir recomendaciones de películas.');
        } else {
          ctx.reply('Error en el login: ' + (loginResponse.payload?.message || 'Credenciales inválidas'));
          userSessions.delete(userId);
        }
        break;
    }
  } catch (error) {
    console.error('Error in auth flow:', error);
    ctx.reply('Error en el proceso de autenticación. Intenta de nuevo.');
    userSessions.delete(userId);
  }
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
      const userId = ctx.from.id;
      console.log('Bot start command received from user:', userId);
      if (!isUserAuthenticated(userId)) {
        ctx.reply('Bienvenido a MovieServer! Para usar el servicio de recomendaciones, necesitas autenticarte.\n\n' +
                 'Comandos disponibles:\n' +
                 '/register - Registrarse\n' +
                 '/login - Iniciar sesión\n' +
                 '/help - Ver ayuda');
      } else {
        ctx.reply('¡Bienvenido de vuelta! Envía una consulta para obtener recomendaciones de películas.');
      }
    });

    bot.command('register', (ctx) => {
      const userId = ctx.from.id;
      console.log('Register command received from user:', userId);
      userSessions.set(userId, { state: 'waiting_username', data: {} });
      ctx.reply('Registro - Ingresa tu nombre de usuario:');
    });

    bot.command('login', (ctx) => {
      const userId = ctx.from.id;
      console.log('Login command received from user:', userId);
      userSessions.set(userId, { state: 'login_waiting_username', data: {} });
      ctx.reply('Login - Ingresa tu nombre de usuario:');
    });

    bot.command('help', (ctx) => {
      const userId = ctx.from.id;
      if (isUserAuthenticated(userId)) {
        ctx.reply('Estás autenticado. Envía cualquier mensaje para obtener recomendaciones de películas.\n\n' +
                 'Comandos:\n' +
                 '/logout - Cerrar sesión\n' +
                 '/help - Ver esta ayuda');
      } else {
        ctx.reply('Comandos disponibles:\n' +
                 '/register - Registrarse\n' +
                 '/login - Iniciar sesión\n' +
                 '/help - Ver ayuda');
      }
    });

    bot.command('logout', async (ctx) => {
      const userId = ctx.from.id;
      if (isUserAuthenticated(userId)) {
        try {
          const session = userSessions.get(userId);
          const message = createMessage(MESSAGE_TYPES.AUTH_LOGOUT, { token: session.token });
          await sendToAuth(message);
          userSessions.delete(userId);
          ctx.reply('Has cerrado sesión exitosamente.');
        } catch (error) {
          ctx.reply('Error al cerrar sesión.');
        }
      } else {
        ctx.reply('No estás autenticado.');
      }
    });

    bot.on('text', async (ctx) => {
      const userId = ctx.from.id;
      const chatId = ctx.chat.id;
      const text = ctx.message.text;

      console.log('Text message received:', { userId, chatId, text, messageId: ctx.message.message_id });

      // Handle registration/login flow
      const session = userSessions.get(userId);
      if (session && session.state) {
        console.log('Handling auth flow for user:', userId, 'state:', session.state);
        await handleAuthFlow(ctx, session, text);
        return;
      }

      // Check authentication for recommendations
      if (!isUserAuthenticated(userId)) {
        console.log('User not authenticated:', userId);
        ctx.reply('Necesitas autenticarte para usar el servicio de recomendaciones.\n\n' +
                 'Usa /register para registrarte o /login para iniciar sesión.');
        return;
      }

      console.log('Processing recommendation request for authenticated user:', userId);
      // Process recommendation request
      const requestId = uuidv4();
      requestMap.set(requestId, { userId, chatId });
      
      const message = createMessage(MESSAGE_TYPES.LLM_REQUEST, { query: text, userId });
      message.correlationId = requestId;
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
    bot.launch({
      dropPendingUpdates: true
    });
    console.log('Telegram Service started');
  } catch (error) {
    console.error('Error starting service:', error);
    process.exit(1);
  }
}

start();