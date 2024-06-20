import { Sequelize } from "sequelize";
const db = new Sequelize('saktistore', 'root', '' ,{
    host: 'localhost',
    dialect: 'mysql'
    });

export default db