/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
* File Name   : index.js
* Created at  : 2020-11-04
* Updated at  : 2020-12-03
* Author      : jeefo
* Purpose     :
* Description :
* Reference   :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
// ignore:start
"use strict";

/* globals*/
/* exported*/

// ignore:end

const fs           = require("@jeefo/fs");
const GmailWatcher = require("gmail_watcher");

const root_dir         = process.cwd();
const mail_path        = `${root_dir}/mail.json`;
const message_path     = `${root_dir}/message.json`;
const tokens_path      = `${root_dir}/tokens.json`;
const history_path     = `${root_dir}/history.json`;
const credentials_path = `${root_dir}/credentials.json`;

// example config
const config = {
    port                : 8000,
    label_ids           : ["INBOX"], // replace
    topic_name          : "projects/PROJECT_ID/topics/TOPIC_NAME", // replace
    label_filter_action : "INCLUDE",
};

(async function main () {
    if (await fs.exists(credentials_path)) {
        config.credentials = await fs.load_json(credentials_path);
    } else {
        console.error("'credentials_path' is not configured.");
        process.exit(1);
    }
    const props = [
        {name: "tokens" , filepath: tokens_path},
        {name: "history", filepath: history_path},
    ];
    for (const {name, filepath} of props) {
        if (await fs.exists(filepath)) {
            config[name] = await fs.load_json(filepath);
        }
    }

    const watcher = new GmailWatcher(config);
    watcher.on("tokens", async tokens => {
        await fs.save_json(tokens_path, tokens);
    });
    watcher.on("history_data", async data => {
        console.log(`New history id: ${data.historyId} at ${Date.now()}`);
        await fs.save_json(history_path, data);
    });
    watcher.on("message", async message => {
        await fs.save_json(message_path, message);
        console.log("Message saved.");
    });
    watcher.on("mail", async mail => {
        await fs.save_json(mail_path, mail);
        console.log("Mail saved.");
    });

    await watcher.authorize();
    await watcher.watch();
})().catch(e => console.error(e));
