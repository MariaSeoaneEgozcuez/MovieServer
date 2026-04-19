import { initRabbitMQ, sendAuthLogin, sendAuthRegister, sendRecommendation, sendSystemStatus } from './rabbit.js'; // 🔥 CAMBIO (quitado sendRequest innecesario)
// Importamos las dependencias necesarias
//import config from 'config'; // Para leer la configuración del sistema
//import axios from 'axios'; // Para hacer peticiones HTTP a la API
import { Telegraf, session } from 'telegraf'; // Telegraf es la librería para crear el bot de Telegram
import 'dotenv/config'; 

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

//const apiBaseUrl = `http://localhost:${config.get('server.port')}`;
const welcomeChatId = process.env.TELEGRAM_WELCOME_CHAT_ID || null;

function resetFlow(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    ctx.session.pending = null;
}

function requireLoginMessage(ctx) {
    ctx.reply('Necesitas iniciar sesión o registrarte para pedir recomendaciones. Usa /register para crear una cuenta, /login para iniciar sesión y /help para ver todos los comandos.');
}

function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

function formatRecommendationResponse(responseData) {
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

    if (responseData?.data) {
        return formatRecommendationResponse(responseData.data);
    }

    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2);
}

bot.start((ctx) => {
    resetFlow(ctx);
    ctx.reply(`Hola ${ctx.from.first_name}! Bienvenido al MovieServer.\nNecesitas iniciar sesión o registrarte para pedir recomendaciones.\nUsa /register para crear una cuenta, /login para iniciar sesión y /help para ver todos los comandos disponibles.`);
});

bot.help((ctx) => {
    ctx.reply('Comandos disponibles:\n/register - Crear cuenta\n/login - Iniciar sesión\n/logout - Cerrar sesión\n/status - Ver el estado del sistema\n/stats - Ver estadísticas del sistema\n/docs - Ver la documentación API\nEnvía un mensaje para pedir recomendaciones cuando estás autenticado.');
});

bot.command('status', async (ctx) => {
    try {
        const data = await sendSystemStatus({}); 
        ctx.reply(`Estado del sistema:\n${data.status}: ${data.message}`); 
    } catch (error) {
        const message = error.message; 
        ctx.reply(`No se pudo consultar el estado del sistema: ${message}`);
    }
});

bot.command('stats', async (ctx) => {
    try {
        const data = await sendRequest('system.stats', {}); 
        if (data?.status === 'success' && data?.stats) { 
            const stats = data.stats;
            const lines = Object.entries(stats).map(([key, value]) => `${key}: ${value}`);
            ctx.reply(`Estadísticas del sistema:\n${lines.join('\n')}`);
        } else {
            ctx.reply('No se pudieron obtener las estadísticas del sistema.');
        }
    } catch (error) {
        const message = error.message; 
        ctx.reply(`No se pudo consultar las estadísticas: ${message}`);
    }
});

bot.command('docs', (ctx) => {
    ctx.reply(`Accede a la documentación aquí: ${apiBaseUrl}/api/docs`);
});

bot.command('register', (ctx) => {
    resetFlow(ctx);
    ctx.session.state = 'register_username';
    ctx.session.pending = {};
    ctx.reply('Vamos a registrar tu cuenta. ¿Cuál será tu nombre de usuario?');
});

bot.command('login', (ctx) => {
    resetFlow(ctx);
    ctx.session.state = 'login_username';
    ctx.session.pending = {};
    ctx.reply('Inicia sesión indicando tu nombre de usuario.');
});

bot.command('logout', async (ctx) => {
    if (!ctx.session?.token) {
        ctx.reply('No estás autenticado actualmente. Usa /login para iniciar sesión.');
        return;
    }

    resetFlow(ctx);
    ctx.session.token = null;
    ctx.session.user = null;
    try {
        await sendRequest('auth.logout', { token }); // RabbitMQ logout
    } catch (error) {
        console.error('Error en logout:', error.message);
    }
    ctx.reply('Has cerrado sesión correctamente. Usa /login para volver a entrar.');
    // (quitado axios logout, opcional implementarlo con Rabbit)
});

async function callRegister(username, email, password) {
    return sendAuthRegister({ username, email, password });
}

async function callLogin(username, password) {
    return sendAuthLogin({ username, password });
}

async function callRecommendation(ctx, query) {
    const token = ctx.session?.token;
    if (!token) throw new Error('No autorizado');

    const response = await sendRecommendation({ query, token });

    return formatRecommendationResponse(response); 
}

bot.on('text', async (ctx) => {
    const text = ctx.message.text?.trim();

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
                    ctx.session.token = loginResponse.token; 
                    ctx.session.user = loginResponse.user; 
                    resetFlow(ctx);
                    ctx.reply('Registro exitoso y has iniciado sesión. Ya puedes pedir recomendaciones.');
                } catch (error) {
                    const message = error.message;
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
                    ctx.session.token = loginResponse.token; 
                    ctx.session.user = loginResponse.user;  
                    resetFlow(ctx);
                    ctx.reply('Has iniciado sesión correctamente. Ahora puedes pedir recomendaciones.');
                } catch (error) {
                    const message = error.message;
                    ctx.reply(`Error de inicio de sesión: ${message}`);
                    resetFlow(ctx);
                }
                return;
            default:
                resetFlow(ctx);
                break;
        }
    }

    if (!ctx.session?.token) {
        requireLoginMessage(ctx);
        return;
    }

    try {
        const recommendation = await callRecommendation(ctx, text);
        ctx.reply(recommendation);
    } catch (error) {
        const errorText = error.message; 
        if (errorText.toLowerCase().includes('autorizado')) { 
            ctx.reply('Tu sesión expiró o no es válida. Usa /login para iniciar sesión de nuevo.');
            ctx.session.token = null;
            ctx.session.user = null;
        } else {
            ctx.reply(`Error al obtener recomendación: ${errorText}`);
        }
    }
});

bot.launch()
    .then(async () => {
        await initRabbitMQ();
        console.log('Telegram bot iniciado correctamente.');
        if (welcomeChatId) {
            await bot.telegram.sendMessage(
                welcomeChatId,
                'El bot de MovieServer se ha iniciado. Usa /start para ver el menú, /register para registrarte o /login para iniciar sesión.'
            );
        }
    })
    .catch((error) => {
        console.error('Error al iniciar el bot de Telegram:', error);
    });