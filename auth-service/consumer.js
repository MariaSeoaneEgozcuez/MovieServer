import { connectRabbitMQ } from '../../shared/messaging/rabbitmq.js'; import jwt, { decode } from 'jsonwebtoken'; 
import bcrypt from 'bcrypt'; 
import config from 'config';
import { jsonParser } from 'config/parser';
import {getUserbyUsername, createUser} from './functions.js';
import { message } from 'telegraf/filters';
import { isTokenRevoked, revokeToken } from '../src/models/user.js';
import { validate } from 'uuid';
import { deferConfig } from 'config/lib/defer';


const RESPONSE_QUEUE = 'auth_response_queue';
const REQUEST_QUEUE = 'auth_request_queue';

export async function startAuthConsumer(){
    const channel = await connectRabbitMQ();
    await channel.assertQueue(REQUEST_QUEUE, {durable : true});
    await channel.assertQueue(RESPONSE_QUEUE, {durable: true});

    channel.consume(REQUEST_QUEUE, async (msg => {
        const request = JSON.parse(msg.content.toString());
        let response;

        try{
            switch (request.action){
                case 'login':
                    response = await handleLogin(request.payload)
                    break;
                
                case 'register':
                    response = await handleRegister(request.payload)
                    break;
                
                case 'logout':
                    response = await handleLogout(request.payload)
                    break;

                case 'validate':
                    respones = await handleValidate(request.payload)
                    break;

                default: 
                    throw new Error('Acción no soportada');
            }
        } catch (error){
            response = {error: error.message};
        }
    }))
}

async function handleRegister({ username, email, password }) {
    const hPass = await bcrypt.hash(password, 10);
    await createUser(username, email, hPass); // nunca se guardan contraseñas no hasheadas
    return { message: 'Usuario creado' };
}


async function handleLogin({ username, password }) {
    // Lógica de login (reutiliza de authControl.js)
    const user = await getUserbyUsername(username); 
    if (!user || !await bcrypt.compare(password, user.password)) { // se compara los hashes del imput con el hash de contraseña
        throw new Error('Credenciales inválidas');
    }

    /* Si coinciden, le da un tokenJWT para poder entrar a su sesión*/

    const token = jwt.sign({ id: user.id, username }, config.get('jwt.secret'), { expiresIn: '1h' }); // expiracion nen 1 hora 
    return { token, user };
}

async function handleLogout({token}){
    await revokeToken(token);
    return({message: 'Sesion cerrada'});
}

async function handleValidate({token}){
    const decoded = jwt.verify(token, config.get('jwt.secret')); // verificar si es valido
    const revoked = await isTokenRevoked(token); // verificar si no está revocado
 
    if (revoked) throw new Error('Token revocado'); 
    return {valid: true, user: decoded};
}
 