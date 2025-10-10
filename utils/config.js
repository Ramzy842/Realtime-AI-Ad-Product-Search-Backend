require("dotenv").config();

const PORT = process.env.PORT;
const ORIGIN = process.env.ORIGIN;

module.exports = {
    ORIGIN,
    PORT,

};