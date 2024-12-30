const express = require("express");
const mongo = require('mongodb');
const MongoClient = mongo.MongoClient
const uri = "mongodb://localhost:27017";
const dbName = "NewDB"
const { Server } = require("socket.io");
const http = require('http');
const app = express();
const server = http.createServer(app)
const io = new Server(server);
const colors = [
    "#d4edda", "#f8d7da", "#fff3cd", "#d1ecf1", "#cce5ff", "#e2e3e5", "#f5c6cb",
    "#ffeeba", "#bee5eb", "#b8daff", "#f8f9fa", "#e9ecef", "#ced4da", "#d6d8db",
    "#d1d3e2", "#e2e8f0", "#f4f7fc", "#f3e6d7", "#ffe0e6", "#fff7e6", "#d9f7be",
    "#bae7ff", "#ffadd2", "#ffe58f", "#a7e8f7", "#d3f261", "#f5f5f5", "#a4d3ee",
    "#dbb4f9", "#c2e9fb"
];
let i = 0;
const userColors = {};
async function connectToDatabase() {
    const client = new MongoClient(uri);
    try {
        // Подключаемся к серверу MongoDB
        await client.connect();
        console.log("Підключена база успішно!");

        // Выбираем базу данных
        const db = client.db(dbName);
        const users = await db.collection("users");
        console.log(`база даних: ${dbName}`);
        //////////////////////////////////////////////////////////
        app.use(express.static('public'));

        io.on(`connection`, (socket)=>{
            console.log(socket.id)

            console.log("connected");
            console.log(io.engine.clientsCount)

            socket.on('register', async ({ name, password }) => {
                socket.username = name;
                socket.password = password;
                console.log(`Зайшов чел з ніком ${socket.username} і паролем ${socket.password}`);

                const existingUser = await users.findOne({ login: password });
                if (existingUser) {
                    socket.emit('registerOn', "error");
                    return;
                }
                await users.insertOne({
                    id: socket.id,
                    login: password,
                    name: socket.username,
                });

                socket.emit('registerOn', "OK");
            });

            socket.on('signIn', async ({name, password}) => {
                try {
                    const user = await users.findOne({ name: name, login: password });
                    if (user) {
                        socket.emit('signInOn', "OK");
                    } else {
                        socket.emit('signInOn', "error");
                    }
                } catch (err) {
                    console.error("помилка при перевірці:", err);
                    socket.emit('signInOn', "error"); // Ошибка валидации
                }
            });

            socket.on('join', (room) => {
                socket.join(room);

                console.log(`користувач ${socket.username} приєднався до кімнати ${room}`);
            });

            socket.on('message', ({ room, text,  }) => {
                if(!userColors[socket.id]) {
                    userColors[socket.id] = colors[i % colors.length];
                    i++
                }
                socket.data.color = userColors[socket.id];
                console.log(`Повідомлення з ${room} від ${socket.username}: ${text}`);
                io.in(room).emit('message', {data:`${socket.username}: ${text}`, color: socket.data.color});
            });


            socket.on('disconnect', () => {
                console.log(`${socket.username} відключився`);
                delete userColors[socket.id];
            });
        })

        server.listen(`3000`, ()=>{
            console.log("сервер запустився на порті 3000")
        })




        // Здесь можно начать работать с коллекциями и документами
    } catch (err) {
        console.error("помилка підключення:", err);
    }
}

connectToDatabase();

