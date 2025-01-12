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
                socket.data.room = nameOfChat;
                    socket.emit('chatCreated', nameOfChat);

            })
            socket.on(`find`, async findAnotherChat=>{

                socket.data.room = findAnotherChat
                const match =  users.findOne( {rooms:findAnotherChat});

                if(match) {

                    await users.updateOne(
                        { name: socket.data.username },
                        { $addToSet: { rooms: socket.data.room } }
                    );
                    socket.emit('chatCreated', socket.data.room);

                    socket.join(findAnotherChat);
                    socket.emit('found', "OK");
                    const collection = db.collection("rooms"); // Получаем коллекцию "rooms"

                    const count = await collection.aggregate([
                        { $match: { room: socket.data.room } }, // Ищем документ с нужной комнатой
                        { $project: { _id: 0, messageCount: { $size: "$messages" } } } // Считаем количество сообщений
                    ]).toArray();

                    const result = await collection.findOne(
                        { room: socket.data.room }, // Условие поиска
                        { projection: { _id: 0, messages: 1 } } // Берем только поле messages
                    );
                    if (result && count.length > 0) {
                    const messageCount = count[0].messageCount;
                    console.log(`користувач ${socket.data.username} приєднався до кімнати ${socket.data.room}`);
                    for(let i = 0; i < messageCount; i++) {
                        socket.emit('message', result.messages[i]);
                    }}
                    else {
                        console.log("Комната не существует или нет сообщений.");
                    }

                } else {
                    socket.emit('found', "error");
                }

            })

            socket.on('join', async (room) => {
                const collection = db.collection("rooms");

                // Получаем количество сообщений в комнате
                const count = await collection.aggregate([
                    { $match: { room: room } }, // Ищем документ с нужной комнатой
                    { $project: { _id: 0, messageCount: { $size: "$messages" } } } // Считаем количество сообщений
                ]).toArray();

                console.log(count);

                // Получаем сами сообщения
                const result = await collection.findOne(
                    { room: room },
                    { projection: { _id: 0, messages: 1 } } // Берем только поле messages
                );

                console.log(result);
                if (result && count.length > 0) {
                    const messageCount = count[0].messageCount;
                    
                    for (let i = 0; i < messageCount; i++) {
                        socket.emit('message', result.messages[i]);
                    }
                } else {
                    console.log("Комната не существует или нет сообщений.");
                }
                socket.join(room);
                socket.data.room = room;
                console.log(`користувач ${socket.data.username} приєднався до кімнати ${room}`);
            });


            socket.on('message', async ({ text }) => {
                if (!userColors[socket.id]) {
                    userColors[socket.id] = colors[i % colors.length];
                    i++;
                }

                socket.data.color = userColors[socket.id];
                const currentRoom = socket.data.room;
                if (!currentRoom) {
                    console.error("Комната не выбрана!");
                    return;
                }

                const message = {
                    username: socket.data.username,
                    messageFromUser: text,
                    timestamp: new Date(),
                    color: socket.data.color,
                };

                try {
                    const collection = db.collection("rooms");
                    await collection.updateOne(
                        { room: socket.data.room },
                        { $push: { messages: message } },
                        { upsert: true } // Создаем документ, если он не существует
                    );

                    io.in(currentRoom).emit('message', message);
                } catch (error) {
                    console.error("Ошибка сохранения сообщения:", error);
                }
            });



            socket.on('disconnect', () => {
                console.log(`${socket.data.username} відключився`);
                delete userColors[socket.id];
            });
        })

        server.listen(`3000`, ()=>{
            console.log("сервер запустився на порті 3000")
        })


    } catch (err) {
        console.error("помилка підключення:", err);
    }
}

connectToDatabase();

