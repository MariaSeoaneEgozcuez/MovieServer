import config from 'config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(config.get("telegram.botToken"));
const telegramId = ctx.from.id;

bot.start((ctx) => {
    ctx.reply('Welcome ' + ctx.from.first_name + '! Lets search for movies you may like. \nFirst, please register or login to your account. \nUse /register or /login to get started.');
});

bot.help((ctx) => {
    ctx.reply('Help');
});

bot.settings((ctx) => {
    ctx.reply('Settings');
});

bot.command('register', async (ctx) => {
    ctx.reply("Register here:\nhttp://localhost:3000/api/auth/register?telegramId=" + telegramId);
});


bot.command('login', async (ctx) => {
    ctx.reply("Login here:\nhttp://localhost:3000/api/auth/login?telegramId=" + telegramId);
});

bot.command('documentation', async (ctx) => {
    
    ctx.reply("Documentation here:\nhttp://localhost:3000/api/docs"); // Revisar
});

bot.on('text', async (ctx) => {

    const userMessage = ctx.message.text;
    const userId = ctx.from.id;

    console.log(`Received message from user ${userId}: ${userMessage}`);
    ctx.reply('Recibido ' + userMessage);
});

bot.launch();