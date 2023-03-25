require('dotenv').config()
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
var globalVars = require('./globalVars');
const open = require('open')
process.env.PORT = Math.floor(Math.random() * 9999);
const port = process.env.PORT || 3001;

globalVars.io = new Server(server, {
    cors: {
        origin: "http://localhost:" + port
    }
});

var cors = require('cors')
const path = require('path');
const publicDirectoryPath = path.join(__dirname, './public')
const Baileys = require('./class/InstanceBaileys')
app.use(cors())
app.use(express.json())

app.use(express.static(publicDirectoryPath))
app.use(express.static('public'))
app.use(express.static('files'))


app.get('/', async (req, res) => {
    return res.render('./public/index.html', { data: response.data });
});

app.post('/connect', async (req, res) => {
    if (!globalVars.instances) {
        globalVars.instances = new Baileys('ChatGPT', '001', req.body)
        globalVars.instances.connectOnWhatsapp()
        res.status(200).json('ok')
    }
});

app.get('/status', async (req, res) => {
    var status = await globalVars?.instances?._statusConnection
    if (status) res.status(200).json(status)
    else res.status(200).json('disconnected')
});

app.post('/disconnect', async (req, res) => {
    if (await globalVars.instances) {
        await globalVars.instances.end(true)
        globalVars.instances = null
        res.status(200).json('ok')
    }

});


server.listen(port, () => {
    console.log(`SERVIDOR GPT + WHATSAPP RORANDO NA PORTA ${port}`);
    open(`http://localhost:${port}`);
});

