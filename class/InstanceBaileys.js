require('dotenv').config();
const makeWaSocket = require('@adiwajshing/baileys').default
const { useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@adiwajshing/baileys')
const { checkPath } = require('../utils/check.js')
const P = require('pino')
const { unlink } = require('fs')

const { Configuration, OpenAIApi } = require("openai");
const globalVars = require('../globalVars');

var openai = null;

class Baileys {
    constructor(name, id, config) {
        this._name = name
        this._id = id
        this._locationFileAuth = './sessionsWA/'
        this._nameFileAuth = name + "-" + id + `.json`
        this._statusConnection = null
        this._sock = null
        this._phoneNumber = null
        this._countQRCode = 0
        this._countReconnect = 0
        this.config = new Configuration(config)
    }

    async connectOnWhatsapp() {
        const { version } = await fetchLatestBaileysVersion()
        checkPath(this._locationFileAuth)
        const { saveState, state } = useSingleFileAuthState(this._locationFileAuth + this._nameFileAuth)
        const config = {
            browser: Browsers.appropriate('Catbot'),
            syncFullHistory: false,
            printQRInTerminal: false,
            connectTimeoutMs: 60_000,
            auth: state,
            logger: P({ level: 'error' }),
            version,
            async getMessage() {
                return { conversation: 'oi' };
            }
        }
        this._sock = makeWaSocket(config)
        config.browser[0] = this._name + '(by @izaias.sferreira)'
        this.connectionUpdate(this._sock.ev)
        this._sock.ev.on('creds.update', saveState)
    }

    connectionUpdate(sock) {
        sock.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                if (this._countQRCode === 5) {
                    this._sock.ev.removeAllListeners()
                    this.end(true)
                    this._countQRCode = 0
                    this._statusConnection = false
                    globalVars.io.emit('statusConnection', 'disconnected')
                } else {
                    this._statusConnection = qr
                    this._countQRCode++
                    globalVars.io.emit('statusConnection', qr)
                }
            }

            if (connection === 'close') {
                const shouldRecnnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
                if (shouldRecnnect) {
                    if (lastDisconnect.error?.output?.statusCode === 401 && this._countReconnect > 3) {
                        this.end()
                        this.connectOnWhatsapp()
                        globalVars.io.emit('statusConnection', 'disconnected')
                        this._statusConnection = 'disconnected'
                    } else if ((lastDisconnect.error?.output?.statusCode === 410 || lastDisconnect.error?.output?.statusCode === 408) && this._countReconnect > 3) {
                        this.end()
                        this.connectOnWhatsapp()
                        this._statusConnection = 'disconnected'
                    } else {
                        this.connectOnWhatsapp()
                        this._countReconnect++
                    }

                }

                if (shouldRecnnect === false) {
                    if (this._countReconnect > 3) {
                        this.end()
                    } else {
                        this.connectOnWhatsapp()
                        this._countReconnect++
                    }

                }
            }

            if (connection === 'open') {
                this._phoneNumber = this._sock.user.id.substring(0, 12)
                console.log('O NÚMERO ',this._phoneNumber,' FOI CONECTADO AO WHATSAPP' )
                this.sockEvents()
                this._countQRCode = 0
                this._statusConnection = 'connected'
                globalVars.io.emit('statusConnection', 'connected')
            }
        })
    }

    async end(logout) {
        if (this._sock && this._locationFileAuth && this._nameFileAuth) {
            this._countQRCode = 0
            this._sock.ev.removeAllListeners('connection.update')
            if (logout) { this._sock.logout() }
            this._sock.end()
            this._sock.ev.removeAllListeners('connection.update')
            unlink(this._locationFileAuth + this._nameFileAuth, (err) => { if (err) console.log("Não foi possível excluir o arquivo", this._locationFileAuth) })
            globalVars.instances = null
            globalVars.io.emit('statusConnection', 'disconnected')
        }
    }





    async sockEvents() {
        openai = new OpenAIApi(this.config);
        this._sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0]
            const jid = msg.key.remoteJid
            if (msg.message) {
                const messageType = Object?.keys(msg.message)[0]
                var messageClient = getTextMessage(msg)
                if (msg && jid !== 'status@broadcast' && msg.hasOwnProperty('message')) { //caso precise adiciona  && msg.type === "notify"
                    if (['extendedTextMessage', 'conversation'].includes(messageType) && !jid.includes("@g.us") && !msg.key.fromMe) {
                        if (messageClient.includes('#image')) {
                            this.generateImages(messageClient, jid)
                        } else {
                            var response = await getDavinciResponse(messageClient)
                            this.sendMessageText(jid, response)
                        }
                    }
                    if (['extendedTextMessage', 'conversation'].includes(messageType) && !jid.includes("@g.us") && !msg.key.fromMe) {
                        var messageClient = getTextMessage(msg)
                        if (messageClient.includes('#image')) {
                            this.generateImagesGroup(messageClient, jid, msg)
                        }
                        if (messageClient.includes('#chat')) {
                            var index = messageClient.indexOf('#chat')
                            var response = await getDavinciResponse(messageClient.substring(index, messageClient.length))
                            this.sendMessageResponseText(jid, response, msg)
                        }
                    }
                }
            }
        })
    }

    async getProfilePic(jid) {
        return await this._sock.profilePictureUrl(jid, 'image')
    }

    //--------------------------------------------------------
    async sendMessageText(id, message) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, { text: message }).catch((err) => console.log(err))
            return response
        }

    }

    async sendMessageImage(id, text, url) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, {
                caption: text || null,
                image: {
                    url: url,
                }
            }).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageAudio(id, url, isNew) {
        if (this._sock) {
            var response = await this._sock.sendMessage(
                id,
                { audio: { url: url }, mimetype: 'audio/mp4', ptt: isNew || false },
                { url: url }, // can send mp3, mp4, & ogg
            )
            return response
        }
    }

    async sendMessageVideo(id, text, url, isGif) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, {
                caption: text || null,
                video: {
                    url: url,
                },
                mimetype: 'video/mp4',
                gifPlayback: isGif || false
            }).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageDocument(id, fileName, url, extension, text) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, {
                caption: text,
                fileName: fileName || "document." + extension,
                mimetype: 'application/' + extension,
                document: {
                    url: url
                }
            }).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageButtons(id, buttons, title, description, footer) {
        if (this._sock) {
            var count = 0
            var buttonsToSend = buttons.map(buttom => {
                count++
                return {
                    index: count - 1,
                    quickReplyButton: { id: buttom.id, displayText: buttom.text }
                }
            })
            const templateButtons = {
                text: `*${title || '_'}*\n\n${description || ''}`,
                footer: footer,
                templateButtons: buttonsToSend
            }
            var response = await this._sock.sendMessage(id, templateButtons).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageLink(id, message) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, { text: message })
            return response
        }
    }

    async deleteMessage(jid, msg, type) {
        const { key, fromMe, messageTimestamp } = msg
        if (this._sock) {
            var response = null
            if (type) {
                response = await this._sock.sendMessage(jid, { delete: key })
            }
            if (!type) {
                response = await this._sock.chatModify({ clear: { messages: [{ id: key.id, fromMe: fromMe, timestamp: messageTimestamp }] } }, jid, [])

            }
            return response
        }
    }

    async sendMessageResponseText(jid, text, msg) {
        if (this._sock) {
            var response = await this._sock.sendMessage(jid, { text: text }, { quoted: msg })
            return response
        }
    }

    async sendMessageResponseImage(id, text, url, msg) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, {
                caption: text || null,
                image: {
                    url: url,
                }
            }, { quoted: msg }).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageResponseAudio(id, url, isNew, msg) {
        if (this._sock) {
            var response = await this._sock.sendMessage(
                id,
                { audio: { url: url }, mimetype: 'audio/mp4', ptt: isNew || false },
                { url: url }, // can send mp3, mp4, & ogg
                { quoted: msg })
            return response
        }
    }

    async sendMessageResponseVideo(id, text, url, isGif, msg) {
        if (this._sock) {
            var response = await this._sock.sendMessage(id, {
                caption: text || null,
                video: {
                    url: url,
                },
                mimetype: 'video/mp4',
                gifPlayback: isGif || false
            }, { quoted: msg }).catch((err) => console.log(err))
            return response
        }
    }

    async sendMessageResponseDocument(id, fileName, url, extension, text, msg) {
        if (this._sock && url && msg) {
            var response = await this._sock.sendMessage(id, {
                caption: text || null,
                fileName: fileName || `document.${extension}`,
                mimetype: 'application/' + extension,
                document: {
                    url: url
                }
            }, { quoted: msg }).catch((err) => console.log(err))
            return response
        }
    }

    async veriyExistsNumber(jid) {
        if (jid && this._sock) {
            const value = await this._sock.onWhatsApp(jid);
            return value[0]
        }
    }
    async generateImagesGroup(messageClient, jid, msg) {
        var index = messageClient.indexOf('#image')
        var responseImg = await getDalleResponse(messageClient.substring(index, messageClient.length))
        if (responseImg.error) {
            this.sendMessageResponseText(jid, "Não foi possivel gerar a imagem, tente de novo", msg)
        } else {
            this.sendMessageResponseText(jid, `*Imagens geradas:*`, msg).then(() => {
                for (let indexx = 0; indexx < responseImg.length; indexx++) {
                    this.sendMessageImage(jid, null, responseImg[indexx])
                }
            }).catch(error => console.log("error :", error))
        }
    }
    async generateImages(messageClient, jid) {
        var index = messageClient.indexOf('#image')
        var responseImg = await getDalleResponse(messageClient.substring(index, messageClient.length))
        if (responseImg.error) {
            this.sendMessageText(jid, "Não foi possivel gerar a imagem, tente de novo")
        } else {
            this.sendMessageText(jid, `*Imagens geradas:*`).then(() => {
                for (let indexx = 0; indexx < responseImg.length; indexx++) {
                    this.sendMessageImage(jid, null, responseImg[indexx])
                }
            }).catch(error => console.log("error :", error))
        }
    }

}

module.exports = Baileys;



function getTextMessage(msg) {
    if (!msg) return null
    var test = Object.keys(msg.message)
    if (test.findIndex(obj => obj === "extendedTextMessage") !== -1) {
        return msg.message.extendedTextMessage.text
    }
    if (test.findIndex(obj => obj === "conversation") !== -1) {
        return msg.message.conversation
    }
}

const getDavinciResponse = async (clientText) => {
    const options = {
        model: "text-davinci-003", // Modelo GPT a ser usado
        prompt: clientText, // Texto enviado pelo usuário
        temperature: 1, // Nível de variação das respostas geradas, 1 é o máximo
        max_tokens: 4000 // Quantidade de tokens (palavras) a serem retornadas pelo bot, 4000 é o máximo
    }

    try {
        const response = await openai.createCompletion(options)
        let botResponse = ""
        response.data.choices.forEach(({ text }) => {
            botResponse += text
        })
        return `${botResponse.trim()}`
    } catch (e) {
        if (e.response.status === 400) {
            return "❌ Erro: O texto é muito grande, tente uma pergunta com menos palavras."
        }
        else if (e.response.status === 401) {
            return "❌ Erro: É possível que as suas credenciais OpenAI estejam erradas, verifique suas credenciais, reinicie o app e tente novamente."
        }
        else { return `❌ Erro OpenAI: ${e}` }
    }
}

const getDalleResponse = async (clientText) => {
    const options = {
        prompt: clientText, // Descrição da imagem
        n: 4, // Número de imagens a serem geradas
        size: "1024x1024", // Tamanho da imagem
    }

    try {
        const response = await openai.createImage(options);
        return response.data.data.map(data => {
            return data.url
        })
    } catch (e) {
        return { error: true, text: `Não foi possível gerar, tente de novo.` }
    }
}