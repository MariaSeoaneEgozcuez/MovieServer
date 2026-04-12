
// Importamos las dependencias necesarias
import config from 'config'; // Para leer la configuración del sistema
// import axios from 'axios'; // Para hacer peticiones HTTP a la API
import { Telegraf, session } from 'telegraf'; // Telegraf es la librería para crear el bot de Telegram
import { sendToQueue, consumeFromQueue, createChannel } from './rabbit.js'; // Funciones para interactuar con RabbitMQ

// Creamos la instancia del bot de Telegram usando el token configurado
const bot = new Telegraf(config.get('telegram.botToken'));
// Habilitamos el uso de sesiones para guardar el estado de cada usuario
bot.use(session());


// URL base de la API REST del backend
// const apiBaseUrl = `http://localhost:${config.get('server.port')}`;
// Chat ID opcional para enviar mensaje de bienvenida automático
const welcomeChatId = config.has('telegram.welcomeChatId') && config.get('telegram.welcomeChatId') ? config.get('telegram.welcomeChatId') : process.env.TELEGRAM_WELCOME_CHAT_ID || null;


// Reinicia el flujo de conversación y borra el estado temporal del usuario
function resetFlow(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    ctx.session.pending = null;
}


// Envía un mensaje indicando que el usuario debe autenticarse
function requireLoginMessage(ctx) {
    ctx.reply('Necesitas iniciar sesión o registrarte para pedir recomendaciones. Usa /register para crear una cuenta, /login para iniciar sesión y /help para ver todos los comandos.');
}


// Devuelve el header de autorización para las peticiones protegidas
function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}


// Da formato legible a la respuesta de recomendaciones para mostrarla en Telegram
function formatRecommendationResponse(responseData) {
    // Si la respuesta es string, intentamos parsear JSON si corresponde
    if (typeof responseData === 'string') {
        const trimmed = responseData.trim();
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
            try {
                responseData = JSON.parse(trimmed);
            } catch (error) {
                return responseData;
            }
        } else {
            return responseData;
        }
    }

    // Si la respuesta ya es un objeto con recomendaciones
    if (responseData?.recommendations && Array.isArray(responseData.recommendations)) {
        let text = 'En base a tus gustos te recomiendo estas películas:\n\n';
        responseData.recommendations.forEach((rec, index) => {
            text += `${index + 1}. ${rec.title} (${rec.year})`;
            if (rec.genres) {
                text += `\n   Géneros: ${Array.isArray(rec.genres) ? rec.genres.join(', ') : rec.genres}`;
            }
            if (rec.reason) {
                text += `\n   Por qué: ${rec.reason}`;
            }
            text += '\n\n';
        });
        return text.trim();
    }

    // Si la respuesta tiene un campo data, lo procesamos recursivamente
    if (responseData?.data) {
        return formatRecommendationResponse(responseData.data);
    }

    // Si no es ninguno de los anteriores, devolvemos el string o el JSON formateado
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2);
}


// Comando /start: mensaje de bienvenida y reseteo de sesión
bot.start((ctx) => {
    resetFlow(ctx);
    ctx.reply(`Hola ${ctx.from.first_name}! Bienvenido al MovieServer.\nNecesitas iniciar sesión o registrarte para pedir recomendaciones.\nUsa /register para crear una cuenta, /login para iniciar sesión y /help para ver todos los comandos disponibles.`);
});


// Comando /help: muestra los comandos disponibles
bot.help((ctx) => {
    ctx.reply('Comandos disponibles:\n/register - Crear cuenta\n/login - Iniciar sesión\n/logout - Cerrar sesión\n/status - Ver el estado del sistema\n/stats - Ver estadísticas del sistema\n/docs - Ver la documentación API\nEnvía un mensaje para pedir recomendaciones cuando estás autenticado.');
});


// Comando /status: consulta el estado del backend
bot.command('status', async (ctx) => {
    try {
        // const response = await axios.get(`${apiBaseUrl}/api/status`);
        const data = response.data;
        ctx.reply(`Estado del sistema:\n${data.status}: ${data.message}`);
    } catch (error) {
        const message = error.response?.data?.error || error.response?.data?.message || error.message;
        ctx.reply(`No se pudo consultar el estado del sistema: ${message}`);
    }
});


// Comando /stats: muestra estadísticas del sistema
bot.command('stats', async (ctx) => {
    try {
        // const response = await axios.get(`${apiBaseUrl}/api/stats`);
        const data = response.data;
        if (data?.status === 'success' && data?.stats) {
            const stats = data.stats;
            const lines = Object.entries(stats).map(([key, value]) => `${key}: ${value}`);
            ctx.reply(`Estadísticas del sistema:\n${lines.join('\n')}`);
        } else {
            ctx.reply('No se pudieron obtener las estadísticas del sistema.');
        }
    } catch (error) {
        const message = error.response?.data?.error || error.response?.data?.message || error.message;
        ctx.reply(`No se pudo consultar las estadísticas: ${message}`);
    }
});


// Comando /docs: muestra el enlace a la documentación Swagger
bot.command('docs', (ctx) => {
    ctx.reply(`Accede a la documentación aquí: ${apiBaseUrl}/api/docs`);
});


// Comando /register: inicia el flujo de registro de usuario
bot.command('register', (ctx) => {
    resetFlow(ctx);
    ctx.session.state = 'register_username';
    ctx.session.pending = {};
    ctx.reply('Vamos a registrar tu cuenta. ¿Cuál será tu nombre de usuario?');
});


// Comando /login: inicia el flujo de login de usuario
bot.command('login', (ctx) => {
    resetFlow(ctx);
    ctx.session.state = 'login_username';
    ctx.session.pending = {};
    ctx.reply('Inicia sesión indicando tu nombre de usuario.');
});


// Comando /logout: cierra la sesión del usuario y revoca el token
bot.command('logout', async (ctx) => {
    if (!ctx.session?.token) {
        ctx.reply('No estás autenticado actualmente. Usa /login para iniciar sesión.');
        return;
    }

    const token = ctx.session.token;
    resetFlow(ctx);
    ctx.session.token = null;
    ctx.session.user = null;

    try {
        await axios.post(`${apiBaseUrl}/api/auth/logout`, null, {
            headers: authHeaders(token)
        });
    } catch (error) {
        console.error('Error en logout:', error.message);
    }
    ctx.reply('Has cerrado sesión correctamente. Usa /login para volver a entrar.');
});


// Función auxiliar para registrar un usuario llamando a la API
async function callRegister(username, email, password, token) {
    // CAMBIO: Enviar el mensaje a RabbitMQ en lugar de llamar directamente a la API
    return sendToQueue({
        action: 'register',
        username,
        email,
        password,
        token
    });
    // return axios.post(`${apiBaseUrl}/api/auth/register`, { username, email, password });
}

// Función auxiliar para hacer login llamando a la API
async function callLogin(username, password) {
    // CAMBIO: Enviar el mensaje a RabbitMQ en lugar de llamar directamente a la API
    return sendToQueue({
        action: 'login',
        username,
        password,
        
    });
    // return axios.post(`${apiBaseUrl}/api/auth/login`, { username, password });
}

// Función auxiliar para pedir recomendaciones a la API
async function callRecommendation(ctx, query) {
    const token = ctx.session?.token;
    if (!token) {
        throw new Error('No autorizado');
    }
    // const response = await axios.post(`${apiBaseUrl}/api/query`, { query }, {
    //     headers: authHeaders(token)
    // });
    const response = await sendToQueue({
        action: 'recommendation',
        query,
        token,
    });

}


// Manejador de mensajes de texto: gestiona el flujo de registro/login y las recomendaciones
bot.on('text', async (ctx) => {
    const text = ctx.message.text?.trim();

    // Si el usuario está en medio de un flujo (registro/login), gestionamos el paso correspondiente
    if (ctx.session?.state) {
        switch (ctx.session.state) {
            case 'register_username':
                ctx.session.pending.username = text;
                ctx.session.state = 'register_email';
                ctx.reply('Perfecto. Ahora dime tu correo electrónico.');
                return;
            case 'register_email':
                ctx.session.pending.email = text;
                ctx.session.state = 'register_password';
                ctx.reply('Gracias. Finalmente, escribe una contraseña segura.');
                return;
            case 'register_password':
                ctx.session.pending.password = text;
                const { username, email, password } = ctx.session.pending;
                try {
                    await callRegister(username, email, password);
                    const loginResponse = await callLogin(username, password);
                    ctx.session.token = loginResponse.data.token;
                    ctx.session.user = loginResponse.data.user;
                    resetFlow(ctx);
                    ctx.reply('Registro exitoso y has iniciado sesión. Ya puedes pedir recomendaciones.');
                } catch (error) {
                    const message = error.response?.data?.message || error.message;
                    ctx.reply(`No se pudo registrar: ${message}`);
                    resetFlow(ctx);
                }
                return;
            case 'login_username':
                ctx.session.pending.username = text;
                ctx.session.state = 'login_password';
                ctx.reply('Introduce tu contraseña.');
                return;

            case 'login_password':
                ctx.session.pending.password = text;
                try {
                    const loginResponse = await callLogin(ctx.session.pending.username, text);
                    ctx.session.token = loginResponse.data.token;
                    ctx.session.user = loginResponse.data.user;
                    resetFlow(ctx);
                    ctx.reply('Has iniciado sesión correctamente. Ahora puedes pedir recomendaciones.');
                } catch (error) {
                    const message = error.response?.data?.message || error.message;
                    ctx.reply(`Error de inicio de sesión: ${message}`);
                    resetFlow(ctx);
                }
                return;
            default:
                resetFlow(ctx);
                break;
        }
    }

    // Si el usuario no está autenticado, le pedimos que se registre o inicie sesión
    if (!ctx.session?.token) {
        requireLoginMessage(ctx);
        return;
    }

    // Si está autenticado, procesamos la petición de recomendación
    try {
        // const recommendation = await callRecommendation(ctx, text);
        // ctx.reply(recommendation);
        sendToQueue({
            query: text,
            chatId: ctx.chat.id, 
            token: ctx.session.token,
        });

        ctx.reply('Buscando recomendaciones para ti... Esto puede tardar unos segundos.');

    } catch (error) {
        //const errorText = error.response?.data?.error || error.message;
        // if (errorText.toLowerCase().includes('autorizado') || error.response?.status === 401 || error.response?.status === 403) {
        //     ctx.reply('Tu sesión expiró o no es válida. Usa /login para iniciar sesión de nuevo.');
        //     ctx.session.token = null;
        //     ctx.session.user = null;
        // } else {
            ctx.reply(`Error al obtener recomendación: ${error.message}`);
        //}
    }
});

await createChannel(); // Creamos la conexión y el canal de RabbitMQ antes de lanzar el bot

consumeFromQueue(async (data) => {
    console.log("Mensaje recibido en bot.js desde RabbitMQ:",data);
    const message = formatRecommendationResponse(data);

    bot.telegram.sendMessage(data.chatId, message);
});

// Lanzamos el bot y, si está configurado, enviamos un mensaje de bienvenida al chat indicado
bot.launch()
    .then(async () => {
        console.log('Telegram bot iniciado correctamente.');
        if (welcomeChatId) {
            await bot.telegram.sendMessage(
                welcomeChatId,
                'El bot de MovieServer se ha iniciado. Usa /start para ver el menú, /register para registrarte o /login para iniciar sesión.'
            );
        } else {
            console.log('Aviso: no se ha configurado telegram.welcomeChatId ni TELEGRAM_WELCOME_CHAT_ID. El mensaje de bienvenida de inicio no se envía automáticamente.');
        }
    })
    .catch((error) => {
        console.error('Error al iniciar el bot de Telegram:', error);
    });