require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const Progress = require('node-fetch-progress');
const { getMediaLink } = require('gddirecturl');

const users = process.env.grantedUsers
const special_user = users.split('|');
const token = process.env.telegramToken;
const savePath = process.env.savePath;
const bot = new Telegraf(token);
bot.telegram.getMe().then((bot) => console.log(`Server has initialized bot nickname. Nick: ${bot.username}`));

async function download(url, path, chatid, mesid) {
    let result;
    const response = await fetch(url);
    //const mime = response.headers.get('content-type');
    const disposition = response.headers.get('content-disposition');
    const filename = (disposition) ? disposition.match(/filename="(.*?)"/) : false;//1
    let fixPath = (filename) ? path+filename[1] : path;
    const progress = new Progress(response, { throttle: 100 })
    progress.on('progress', async (p) => {
        let persen = Math.floor(p.progress * 100);
        let estimasi = `<b>Downloading...</b>\n\n`+
        `File size : ${p.totalh}\n`+
        `Downloaded : ${p.doneh} ( ${persen}% )\n`+
        `Transfer rate : ${p.rateh}`;
        if(persen%20==0 && persen != 100){
            await bot.telegram.editMessageText(chatid, mesid, null, estimasi, { parse_mode: 'html' });
        }
        process.stdout.write(
            `${Math.floor(p.progress * 100)}% - ${p.doneh}/${p.totalh} - ${p.rateh} - ${p.etah}                       \r`
        )
    })
    const buffer = await response.buffer();
    await fs.outputFile(fixPath, buffer, {flag: 'a'}).then(() => {
        result = `Saved to ${fixPath}`;
    }).catch(err => {
        console.log(err)
        result = "Error saving file!";
    });
    return result;
}

function folderCategory(mime){
    let folder;
    if((/document|pdf|powerpoint|msword|presentation|excel|sheet/g).test(mime)){
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
bot.command('download', (ctx) => ctx.reply('URL?', Markup.forceReply(true).selective(true)));

bot.on('document', async (ctx) => {
    const { message: { from: { id, username, first_name }, document: { file_name, mime_type, file_id }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    console.log(file_name)
    const { message_id } = await ctx.reply(`Processing...`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const save = await download(fileUrl.href, `${savePath}/${first_name}/${folder}/${file_name}`, id, message_id);
    console.log(`[!] Result : ${save}`);
    await ctx.reply(save);
    await ctx.deleteMessage(message_id);
});

bot.on('photo', async (ctx) => {
    await ctx.reply(`Send as file agar kualitas foto tidak berkurang!`);
});

bot.on('video', async (ctx) => {
    const { message: { from: { id, username, first_name }, video: { file_name, mime_type, file_id }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const { message_id } = await ctx.reply(`Processing...`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const save = await download(fileUrl.href, `${savePath}/${first_name}/${folder}/${file_name}`, id, message_id);
    console.log(`[!] Result : ${save}`);
    await ctx.reply(save);
    await ctx.deleteMessage(message_id);
});

bot.on('text', async (ctx) => {
    let downloadUrl;
    const { message: { reply_to_message, text, from: { id, username, first_name } } } = ctx
    if (reply_to_message && reply_to_message.text === "URL?") {
        console.log(`[+] From : ${username} | ${text}`);
        const regex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/g;
        if(regex.test(text)){
            const { message_id } = await ctx.reply(`Processing...`);
            let filename = new URL(text).pathname.split('/').pop();
            if(filename) {
                if((/drive.google.com/gi).test(text)){
                    const gdriveId = text.match(/[-\w]{25,}/);
                    const gdriveDirect = await getMediaLink(gdriveId[0]);
                    downloadUrl = gdriveDirect.src;
                } else {
                    downloadUrl = text;
                }
                const save = await download(downloadUrl, `${savePath}/${first_name}/Downloads/${filename}`, id, message_id);
                console.log(`[!] Result : ${save}`);
                await ctx.reply(save);
            } else {
                await ctx.reply("I think it's not downloadable file.");
            }
            await ctx.deleteMessage(message_id);
        } else {
            await ctx.reply("Invalid URL!");
        }
    }
});

bot.launch();