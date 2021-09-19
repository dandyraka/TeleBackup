require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const fetch = require('node-fetch');

const users = process.env.grantedUsers
const special_user = users.split('|');
const token = process.env.telegramToken;
const savePath = process.env.savePath;
const bot = new Telegraf(token);
bot.telegram.getMe().then((bot) => console.log(`Server has initialized bot nickname. Nick: ${bot.username}`));

async function download(url, path) {
    let result;
    const response = await fetch(url);
    const buffer = await response.buffer();
    await fs.outputFile(path, buffer, {flag: 'a'}).then(() => {
        result = `Saved to ${path}`;
    }).catch(err => {
        console.log(err)
        result = "Error saving file!";
    });
    return result;
}

function folderCategory(mime){
    let folder;
    if((/document|pdf|powerpoint|msword|presentation/g).test(mime)){
        folder = "Document";
    } else if((/image/g).test(mime)){
        folder = "Photo";
    } else if((/video/g).test(mime)){
        folder = "Video";
    } else if((/audio/g).test(mime)){
        folder = "Audio";
    } else if((/text/g).test(mime)){
        folder = "Text";
    } else if((/zip|rar|7z/g).test(mime)){
        folder = "Compressed";
    } else {
        folder = "Other";
    }
    return folder;
}

bot.start((ctx) => ctx.reply('Kirim file untuk backup pada local server'));
bot.help((ctx) => ctx.reply('Kirim file untuk backup pada local server'));

bot.on('document', async (ctx) => {
    const { message: { from: { username, first_name }, document: { file_name, mime_type, file_id }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    
    const { message_id } = await ctx.reply(`Processing...`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const save = await download(fileUrl.href, `${savePath}/${first_name}/${folder}/${file_name}`);
    console.log(`[!] Result : ${save}`);
    await ctx.reply(save);
    await ctx.deleteMessage(message_id);
});

bot.on('photo', async (ctx) => {
    await ctx.reply(`Send as file agar kualitas foto tidak berkurang!`);
});

bot.on('video', async (ctx) => {
    const { message: { from: { username, first_name }, video: { file_name, mime_type, file_id }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const { message_id } = await ctx.reply(`Processing...`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const save = await download(fileUrl.href, `${savePath}/${first_name}/${folder}/${file_name}`);
    console.log(`[!] Result : ${save}`);
    await ctx.reply(save);
    await ctx.deleteMessage(message_id);
});

bot.launch();