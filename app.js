// Certificate 
const fs = require('fs');  

const privateKey = fs.readFileSync('/etc/letsencrypt/live/omahbata.ddns.net/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/omahbata.ddns.net/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/omahbata.ddns.net/chain.pem', 'utf8');
const credentials = { 
    key: privateKey, 
    cert: certificate,
    ca:ca
};

const test = "";
const path = require('path');
const { Client, Location, List, Buttons, LocalAuth  } = require('./index');
const qrcode = require('qrcode');
const express = require("express");
const SocketIO = require("socket.io");
const http = require("http"); 
const app = express(); // CREATE WEB  
const port = process.env.NODE_PORT || 2000; 
const https = require('https').createServer(credentials, app);  
const { phoneNumberFormatter } = require('./helpers/formatter');
const io = SocketIO(https, {
   cors: {
      origin: "*",
      methods: ["GET", "POST"]
   },
   allowEIO3: true // false by default
});
  

// BAGIAN SESSION 
const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json'; 
const createSessionsFileIfNotExists = function() {
   if (!fs.existsSync(SESSIONS_FILE)) {
     try {
       fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
       console.log('Sessions file created successfully.');
     } catch(err) {
       console.log('Failed to create sessions file: ', err);
     }
   }
}
createSessionsFileIfNotExists();
const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}
const getSessionsFile = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}
const createSession = function(id, description) {
   console.log('Creating session: ' + id);
   const client = new Client({
      restartOnAuthFail: true,
      puppeteer: {
    //  executablePath: " /usr/bin/google-chrome",
         headless: true,
         args: [
         '--no-sandbox',
         '--disable-setuid-sandbox',
         '--disable-dev-shm-usage',
         '--disable-accelerated-2d-canvas',
         '--no-first-run',
         '--no-zygote',
         '--single-process', // <- this one doesn't works in Windows
         '--disable-gpu'
         ],
      },
      authStrategy: new LocalAuth({
         clientId: id
      })
   });
   client.initialize();

   client.on('qr', (qr) => { 
      qrcode.toDataURL(qr, (err, url) => {
         console.log('send qr to web: ' + id);
         io.emit('qr', { id: id, src: url });
         io.emit('message', { id: id, text: 'QR Code received, scan please!' });
      });
   });
   
   client.on('ready', () => {
      io.emit('ready', { id: id });
      io.emit('message', { id: id, text: 'Whatsapp is ready!' });

      const savedSessions = getSessionsFile();
      const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
      savedSessions[sessionIndex].ready = true;
      setSessionsFile(savedSessions);
   });
   
   client.on('authenticated', () => {
      io.emit('authenticated', { id: id });
      io.emit('message', { id: id, text: 'Whatsapp is authenticated!' });
   });
   
   client.on('auth_failure', function() {
      io.emit('message', { id: id, text: 'Auth failure, restarting...' });
   });
   
   client.on('disconnected', (reason) => {
      io.emit('message', { id: id, text: 'Whatsapp is disconnected!' });
      client.destroy();
      client.initialize();
   
      // Menghapus pada file sessions
      const savedSessions = getSessionsFile();
      const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
      savedSessions.splice(sessionIndex, 1);
      setSessionsFile(savedSessions);
   
      io.emit('remove-session', id);
   });
   client.on('message', msg => {
    console.log('MESSAGE RECEIVED', msg);
    if (msg.body === '!buttons') {
        let button = new Buttons('Button body',[{body:'bt1'},{body:'bt2'},{body:'bt3'}],'title','footer');
        client.sendMessage(msg.from, button);
    }else if (msg.body === '!ping') {
        client.sendMessage(msg.from, 'pong');
    }  else if (msg.body === '!list') {
        let sections = [{title:'sectionTitle',rows:[{title:'ListItem1', description: 'desc'},{title:'ListItem2'}]}];
        let list = new List('List body','btnText',sections,'Title','footer');
        client.sendMessage(msg.from, list);
    }
   });
      // Tambahkan client ke sessions
   sessions.push({
      id: id,
      description: description,
      client: client
   });
   
      // Menambahkan session ke file
   const savedSessions = getSessionsFile();
   const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
   
   if (sessionIndex == -1) {
      savedSessions.push({
         id: id,
         description: description,
         ready: false,
      });
      setSessionsFile(savedSessions);
   }
}


const init = function(socket) {
   const savedSessions = getSessionsFile();
 
   if (savedSessions.length > 0) {
      if (socket) {   
         socket.emit('init', savedSessions);
      } else {
         savedSessions.forEach(sess => {
            createSession(sess.id, sess.description);
         });
      }
   }
} 
init();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

// ROOT PAGE SERVER 
app.get("/", (req, res) => {  
   res.redirect('/dashboard'); 
})
app.get("/dashboard", (req, res) => {  
   res.sendFile(path.join(__dirname, 'public','menu.html')); 
})
app.get("/account", (req, res) => {  
   res.sendFile(path.join(__dirname, 'public','menu.html')); 
})
app.get("/informasi", (req, res) => {  
   res.sendFile(path.join(__dirname, 'public','menu.html')); 
})
 
//FUNCTION GET DATA
app.post("/get-menu", (req, res) => {
   let menu = req.body.menu;
   switch (menu){
      case "dashboard":   
         res.sendFile(path.join(__dirname, 'public', 'content','dashboard.html')); 
         break;
      case "informasi":   
         res.sendFile(path.join(__dirname, 'public', 'content','informasi.html')); 
         break;
      default:
         res.sendFile(path.join(__dirname, 'public', 'content','account.html')); 
         break;  
   };  
})
app.post('/send-message', async (req, res) => {
   console.log(req);
 
   const sender = req.body.sender;
   const number = phoneNumberFormatter(req.body.number);
   const message = req.body.message;
   const url = req.body.url; 
 
   const client = sessions.find(sess => sess.id == sender).client;
 
   // Make sure the sender is exists & ready
   if (!client) {
     return res.status(422).json({
       status: false,
       message: `The sender: ${sender} is not found!`
     })
   }  
   if(url){
        let button = new Buttons(message,[{body:'Login',url:url}],'','');
        client.sendMessage(number, button).then(response => {
         res.status(200).json({
           status: true,
           response: response
         });
       }).catch(err => {
         res.status(500).json({
           status: false,
           response: err
         });
       });
   }else{
       client.sendMessage(number, message).then(response => {
         res.status(200).json({
           status: true,
           response: response
         });
       }).catch(err => {
         res.status(500).json({
           status: false,
           response: err
         });
       });
   }
   
 });
app.use(function(req, res) {
   res.redirect('/dashboard'); 
}); 
io.on('connection', function(socket) {
   
   init(socket);
 
   console.log("new socket is connected:" + socket.id)
   socket.on('create-session', function(data) {
     console.log('Creating session from web: ' + data.id);
     createSession(data.id, data.description);
   });
}); 
https.listen(port, function () {
   console.log("app Running on *:" + port)
})