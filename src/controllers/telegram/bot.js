import config from 'config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(config.get("telegram.botToken"));

bot.start((ctx) => {
    ctx.reply('Start');
});

bot.help((ctx) => {
    ctx.reply('Help');
});

bot.settings((ctx) => {
    ctx.reply('Settings');
});

bot.launch();