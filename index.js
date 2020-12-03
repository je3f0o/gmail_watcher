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

const is           = require("@jeefo/utils/is");
const EventEmitter = require("@jeefo/utils/event_emitter");
const http         = require("http");
const url_parse    = require("url").parse;
const {google}     = require("googleapis");

const {isArray} = Array;

const get_message = async (gmail, message) => {
    const res = await gmail.users.messages.get({id: message.id, userId: "me"});
    if (res.status === 200) {
        const mail        = res.data;
        const {data}      = mail.payload.body;
        mail.payload.body = Buffer.from(data, "base64").toString("utf8");
        return mail;
    }
};

const unknown_error = res => {
    const error    = new Error("Unknown response");
    error.response = res;
    return error;
};

module.exports = class GmailWatcher extends EventEmitter {
    constructor (config) {
        super(true);
        if (! is.object(config)) {
            throw new TypeError(`GmailWatcher(config) is not an object.`);
        }
        if (! is.object(config.credentials)) {
            throw new TypeError(
                `GmailWatcher(config.credentials) is not an object.`
            );
        }
        if (! is.string(config.topic_name)) {
            throw new TypeError(
                `GmailWatcher(config.topic_name) is not a string.`
            );
        }
        if (! isArray(config.label_ids)) {
            throw new TypeError(
                `GmailWatcher(config.label_ids) is not an array.`
            );
        }
        if (! is.string(config.label_filter_action)) {
            throw new TypeError(
                `GmailWatcher(config.label_filter_action) is not an array.`
            );
        }
        if (config.history) this.history = config.history;

        const {client_id, client_secret, redirect_uris} = config.credentials;

        this.config = Object.assign({}, config);
        if (! is.number(this.config.pull_interval)) {
            this.config.pull_interval = 5e3;
        }

        this.client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris,
        );
        this.client.on("tokens", async tokens => {
            this.emit("tokens", tokens);
            this.set_credentials(tokens);
        });
    }

    set_credentials (tokens) {
        this.client.setCredentials(tokens);
        this.gmail = google.gmail({
            auth    : this.client,
            version : "v1",
        });
    }

    async authorize () {
        if (this.config.tokens) {
            return this.set_credentials(this.config.tokens);
        }

        return new Promise(async resolve => {
            const server = http.createServer(async (req, res) => {
                const {code} = url_parse(req.url, true).query;
                if (code) {
                    console.log(`Got code: '${code}'`);
                    const {tokens} = await this.client.getToken(code);
                    this.set_credentials(tokens);

                    res.end("<h1>Done.</h1>");
                    server.close();
                    resolve();
                } else {
                    res.statusCode = 404;
                    res.end("Not found");
                }
            });

            const {port} = this.config;
            server.listen(port, () => {
                const options = {
                    // 'online' (default) or 'offline' (gets refresh_token)
                    access_type: "offline",

                    // If you only need one scope you can pass it as a string
                    scope: "https://www.googleapis.com/auth/gmail.readonly"
                };
                const url = this.client.generateAuthUrl(options);

                console.log(`HTTP Server listening on port: ${port}`);
                console.log(url);
            });
        });
    }

    async watch () {
        const {gmail} = this;

        if (! this.history) {
            const res = await gmail.users.watch({
                userId      : "me",
                requestBody : {
                    labelIds          : this.config.label_ids,
                    topicName         : this.config.topic_name,
                    labelFilterAction : this.config.label_filter_action,
                }
            });
            switch (res.status) {
                case 200 :
                    this.history = res.data;
                    this.emit("history_data", this.history);
                    break;
                case 400 :
                    await this.stop();
                    return this.watch();
                default:
                    throw unknown_error(res);
            }
        }

        // Ready to pull request
        return new Promise((resolve, reject) => {
            const {pull_interval} = this.config;

            const retrieve_mails = async histories => {
                for (const history of histories) {
                    for (const message of history.messages) {
                        this.emit("message", message);
                        const mail = await get_message(gmail, message);
                        this.emit("mail", mail);
                    }
                }
            };

            const pull_request = async () => {
                try {
                    const res = await gmail.users.history.list({
                        userId         : "me",
                        startHistoryId : this.history.historyId
                    });
                    switch (res.status) {
                        case 200 :
                            if (res.data.history) {
                                await retrieve_mails(res.data.history);
                            }

                            this.history.historyId = res.data.historyId;
                            this.emit("history_data", this.history);
                            this.timeout_id = setTimeout(
                                pull_request, pull_interval
                            );
                            break;
                        default: throw unknown_error(res);
                    }
                } catch (e) {
                    reject(e);
                }
            };

            this.timeout_id = setTimeout(pull_request, pull_interval);
        });
    }

    stop () { return this.gmail.users.stop({userId: "me"}); }
};
