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
                socket.data.username = name;
                socket.data.password = password;
                console.log(`Зайшов чел з ніком ${socket.data.username} і паролем ${socket.data.password}`);

                const existingUser = await users.findOne({ name: name });
                if (existingUser) {
                    socket.emit('registerOn', "error");
                    return;
                }
                await users.insertOne({
                    id: socket.id,
                    login: password,
                    name: socket.data.username,
                    rooms: [],
                });

                socket.emit('registerOn', "OK");
            });

            socket.on('signIn', async ({ name, password }) => {
                const user = await users.findOne({ name, login: password });
                if (user) {
                    socket.data.username = name; // Сохраняем имя пользователя
                    const rooms = user.rooms || []; // Проверяем, есть ли комнаты
                    socket.emit('signInOn', "OK");
                    socket.emit('allChats', rooms); // Отправляем список комнат после успешного входа
                    console.log(`зайшов чел з ніком ${socket.data.username}`);
                } else {
                    socket.emit('signInOn', "error");
                }
            });



            socket.on('newChat', async (nameOfChat) => {

                await users.updateOne(
                    { name: socket.data.username },
                    { $addToSet: { rooms: nameOfChat } }
                );
                    socket.emit('chatCreated', nameOfChat);

            })


            socket.on('join', (room) => {
                socket.join(room);
                currentRoom = room
                console.log(`користувач ${socket.data.username} приєднався до кімнати ${room}`);
            });

            socket.on('message', ({ text }) => {
                if(!userColors[socket.id]) {
                    userColors[socket.id] = colors[i % colors.length];
                    i++
                }
                socket.data.color = userColors[socket.id];
                console.log(socket.id)
                console.log(`Повідомлення від ${socket.data.username}: ${text}`);
                io.in(currentRoom).emit('message', {data:`${socket.data.username}: ${text}`, color: socket.data.color});
            });


            socket.on('disconnect', () => {
                console.log(`${socket.data.username} відключився`);
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

