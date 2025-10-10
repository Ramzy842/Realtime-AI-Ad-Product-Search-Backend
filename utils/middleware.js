var morgan = require("morgan");

const logger = morgan(function (tokens, req, res) {
    return [
        tokens.method(req, res),
        tokens.url(req, res),
        tokens.status(req, res),
        tokens.res(req, res, "content-length"),
        "-",
        tokens["response-time"](req, res),
        "ms",
        tokens.method(req, res) === "POST" ? JSON.stringify(req.body) : "",
    ].join(" ");
});

const unknownEndpoint = (req, res) => {
    res.status(404).send({
        success: false,
        statusCode: 404,
        error: "unknown endpoint",
    });
};

const errorHandler = (err, req, res, next) => {
    if (err.name === "CastError") {
        return res.status(400).json({
            success: false,
            statusCode: 400,
            error: "Malformatted Id",
        });
    } else if (err.name === "JsonWebTokenError")
        return res
            .status(401)
            .json({ success: false, statusCode: 401, error: "Token invalid" });
    else if (err.name === "TokenExpiredError")
        return res.status(401).json({
            success: false,
            statusCode: 401,
            error: "Token expired",
        });
    return res.status(500).json({
        success: false,
        statusCode: 500,
        error: "Internal Server Error.",
    });
};


module.exports = {
    logger,
    unknownEndpoint,
    errorHandler,
};