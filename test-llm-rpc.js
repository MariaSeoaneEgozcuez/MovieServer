import { sendRPCRequest } from './api-gateway/src/lib/rabbitmqClient.js';

async function main() {
  try {
    const response = await sendRPCRequest('llm.requests', {
      query: 'Recomiéndame una película de ciencia ficción'
    });

    console.log('Respuesta LLM:', response);
  } catch (error) {
    console.error('Error LLM RPC:', error.message);
  } finally {
    process.exit(0);
  }
}

main();