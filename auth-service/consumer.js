import { connectRabbitMQ } from './rabbitmq.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from 'config';

import { getUserbyUsername, createUser, isTokenRevoked, revokeToken} from './functions.js';


const REQUEST_QUEUE = 'auth.requests';

export async function startAuthConsumer() {
    const channel = await connectRabbitMQ();

    await channel.assertQueue(REQUEST_QUEUE, { durable: true });

    const consumerTag = await channel.consume(REQUEST_QUEUE, async (msg) => {
        if (!msg) return;

        const correlationId = msg.properties.correlationId;
        const replyTo = msg.properties.replyTo;

        let response;

        try {
            const request = JSON.parse(msg.content.toString());

            // Soportar ambos formatos: "action" (viejo) y "operation" (nuevo RPC)
            const operation = request.action || request.operation;
            // Extraer payload o usar request completo sin operation/action
            const payload = request.payload || (({ operation, action, ...rest }) => rest)(request);

            switch (operation) {
                case 'login':
                case 'auth.login':
                    response = await handleLogin(payload);
                    break;

                case 'register':
                case 'auth.register':
                    response = await handleRegister(payload);
                    break;

                case 'logout':
                case 'auth.logout':
                    response = await handleLogout(payload);
                    break;

                case 'validate':
                case 'auth.validate':
                    response = await handleValidate(payload);
                    break;

                default:
                    throw new Error(`Acción no soportada: ${operation}`);
            }

        } catch (error) {
            response = { error: error.message };
        }

        // Si hay replyTo, responder en patrón RPC
        if (replyTo) {
            channel.sendToQueue(
                replyTo,
                Buffer.from(JSON.stringify(response)),
                { 
                    persistent: true,
                    correlationId: correlationId
                }
            );
            console.log(`[Auth RPC] Respuesta enviada a ${replyTo} (${correlationId})`);
        }

        channel.ack(msg);

    }, { noAck: false });

    process.on('SIGINT', async () => {
        console.log('Cerrando consumer...');
        await channel.cancel(consumerTag.consumerTag);
        await channel.close();
        process.exit(0);
    });
}


// -------------------- HANDLERS --------------------

async function handleRegister({ username, email, password }) {
    const hPass = await bcrypt.hash(password, 10);
    await createUser(username, email, hPass);
    return { message: 'Usuario creado' };
}

async function handleLogin({ username, password }) {
    const user = await getUserbyUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new Error('Credenciales inválidas');
    }

    const token = jwt.sign(
        { id: user.id, username },
        config.get('jwt.secret'),
        { expiresIn: '1h' }
    );

    return { token, user };
}

async function handleLogout({ token }) {
    await revokeToken(token);
    return { message: 'Sesión cerrada' };
}

async function handleValidate({ token }) {
    const decoded = jwt.verify(token, config.get('jwt.secret'));
    const revoked = await isTokenRevoked(token);

    if (revoked) throw new Error('Token revocado');

    return { valid: true, user: decoded };
}
