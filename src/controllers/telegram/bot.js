import config from 'config';
import { Telegraf } from 'telegraf';
import { getMovieRecomendation } from '../../models/ollama/index.js';
// import { getUserByTelegramId } from '../../models/db.js';

const bot = new Telegraf(config.get("telegram.botToken"));

bot.start((ctx) => {
    ctx.reply('Welcome ' + ctx.from.first_name + '! Lets search for movies you may like. \nFirst, please register or login to your account. \nUse /register or /login to get started.');
});

bot.help((ctx) => {
    ctx.reply('Before sending a message, please register or login to your account. \n/register to create an account \n/login to access your account\n/logout to exit. \nSend any message to get movie recommendations based on your preferences.');
});

bot.settings((ctx) => {
    ctx.reply('Settings');
});

// bot.command('register', async (ctx) => {
//     const telegramId = ctx.from.id;
//     ctx.reply("Register here:\nhttp://localhost:3000/api/auth/register?telegramId=" + telegramId);
// });


// bot.command('login', async (ctx) => {
//     const telegramId = ctx.from.id;
//     ctx.reply("Login here:\nhttp://localhost:3000/api/auth/login?telegramId=" + telegramId);
// });

// bot.command('logout', async (ctx) => {
//     const telegramId = ctx.from.id;
//     ctx.reply("Logout here:\nhttp://localhost:3000/api/auth/logout?telegramId=" + telegramId);
// });

// bot.command('documentation', async (ctx) => {

//     ctx.reply("Documentation here:\nhttp://localhost:3000/api/docs"); // Revisar
// });

bot.on('text', async (ctx) => {

    const telegramId = ctx.from.id;
 //   const user = await getUserByTelegramId(telegramId); // Implementa esta función para obtener el usuario de tu base de datos

    // if (!user) {
    //     ctx.reply('Please register or login first using /register or /login.');
    //     return;
    // }

    const userMessage = ctx.message.text;
    const userId = ctx.from.id;

    console.log(`Received message from user ${userId}: ${userMessage}`);

    const recommendation = await getMovieRecomendation(userMessage);
    ctx.reply(recommendation);
});

bot.launch();