import * as amqp from 'amqplib';
import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MESSAGE_TYPES, createMessage } from './messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration directly
const configPath = join(__dirname, 'config', 'default.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

let channel;

async function connectRabbitMQ() {
  const connection = await amqp.connect(config.rabbitmq.url);
  channel = await connection.createChannel();
  await channel.assertQueue('llm-service');
  console.log('LLM Service connected to RabbitMQ');
}

async function getMovieRecommendation(userMessage) {
  try {
    // Try to call Ollama API if configured
    if (config.ollama.host && config.ollama.host !== '') {
      const res = await axios.post(
        config.ollama.host + '/api/chat',
        {
          model: config.ollama.model,
          messages: [
            { role: 'system', content: 'Eres un recomendador de películas. Responde solo con JSON de recomendaciones.' },
            { role: 'user', content: userMessage }
          ],
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${config.ollama.key}`
          }
        }
      );
      return res.data.message.content;
    }
  } catch (error) {
    console.log('Ollama API not available, using mock recommendation:', error.message);
  }
  
  // Return mock recommendation
  return JSON.stringify({
    movies: [
      { title: 'The Matrix', year: 1999, rating: 9 },
      { title: 'Inception', year: 2010, rating: 9 }
    ],
    reason: 'Based on: ' + userMessage
  });
}

async function handleMessage(msg) {
  if (!msg) return;
  
  try {
    const message = JSON.parse(msg.content.toString());
    console.log('LLM received message:', message.type, 'correlation:', message.correlationId);

    if (message.type === MESSAGE_TYPES.LLM_REQUEST) {
      try {
        const recommendation = await getMovieRecommendation(message.payload.query);
        const responseMessage = createMessage(MESSAGE_TYPES.LLM_RESPONSE, {
          recommendation
        });
        // Include the correlation ID from the request
        responseMessage.correlationId = message.correlationId;
        
        // Send to telegram-responses queue (specific for telegram service)
        await channel.assertQueue('telegram-responses');
        channel.sendToQueue('telegram-responses', Buffer.from(JSON.stringify(responseMessage)));
        console.log('LLM Response sent for correlationId:', message.correlationId);
      } catch (error) {
        console.error('LLM error processing request:', error.message);
      }
    }

    channel.ack(msg);
  } catch (error) {
    console.error('Error parsing message:', error);
    channel.nack(msg);
  }
}

async function start() {
  try {
    console.log('Starting LLM Service...');
    await connectRabbitMQ();
    channel.consume('llm-service', handleMessage);
    console.log('LLM Service started and listening for messages');
  } catch (error) {
    console.error('Error starting LLM Service:', error);
    process.exit(1);
  }
}

start().catch(error => {
  console.error('Unhandled error in start:', error);
  process.exit(1);
});