import { connectRabbitMQ } from './rabbitmq.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from 'config';

import { getUserbyUsername, createUser, isTokenRevoked, revokeToken} from './functions.js';


const RESPONSE_QUEUE = 'auth_response_queue';
const REQUEST_QUEUE = 'auth_request_queue';

export async function startAuthConsumer() {
    const channel = await connectRabbitMQ();

    await channel.assertQueue(REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RESPONSE_QUEUE, { durable: true });

    const consumerTag = await channel.consume(REQUEST_QUEUE, async (msg) => {
        if (!msg) return;

        let response;

        try {
            const request = JSON.parse(msg.content.toString());

            switch (request.action) {
                case 'login':
                    response = await handleLogin(request.payload);
                    break;

                case 'register':
                    response = await handleRegister(request.payload);
                    break;

                case 'logout':
                    response = await handleLogout(request.payload);
                    break;

                case 'validate':
                    response = await handleValidate(request.payload);
                    break;

                default:
                    throw new Error('Acción no soportada');
            }

        } catch (error) {
            response = { error: error.message };
        }

        channel.sendToQueue(
            RESPONSE_QUEUE,
            Buffer.from(JSON.stringify(response)),
            { persistent: true }
        );

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
